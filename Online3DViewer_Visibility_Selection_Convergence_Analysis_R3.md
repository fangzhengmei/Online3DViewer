# Online3DViewer 可见性与选择状态收敛规则深度分析报告

## 1. 执行摘要

本报告深入分析 Online3DViewer 中**可见性操作**与**选择状态**、**高亮状态**之间的收敛规则，重点关注：
- 隐藏已选中对象的状态转移
- 隔离(Isolate)操作的完整状态生命周期
- Show All 操作的状态恢复一致性
- 批量操作的回调触发时序与渲染同步窗口

**核心发现**：
1. **视觉一致性始终保证**：即使内部状态可能"不一致"，但渲染结果始终正确
2. **懒惰收敛设计**：选择状态不随可见性自动清除，依赖后续用户操作或 Show All 来恢复
3. **存在 UX 边界问题**：导航面板中隐藏的网格可能仍显示选中高亮背景

---

## 2. 状态系统架构

### 2.1 三态系统定义

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           状态系统架构                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌─────────────────────┐    ┌─────────────────────┐                     │
│  │   选择状态系统       │    │   可见性状态系统     │                     │
│  ├─────────────────────┤    ├─────────────────────┤                     │
│  │ 导航层:             │    │ 导航层:             │                     │
│  │  • navigator.selection │  │  • MeshItem.visible │                    │
│  │  • SelectionType     │    │  • NodeItem.visible │                    │
│  │    - Mesh            │    │                     │                     │
│  │    - Material        │    │ 渲染层:             │                     │
│  │  • tempSelectedMeshId │   │  • THREE.Mesh.visible │                  │
│  │    (临时选择/悬停)   │    │                     │                     │
│  └──────────┬──────────┘    └──────────┬──────────┘                     │
│             │                            │                               │
│             ▼                            ▼                               │
│  ┌─────────────────────────────────────────────────────┐                │
│  │              高亮状态系统（渲染层）                    │                │
│  ├─────────────────────────────────────────────────────┤                │
│  │  • mesh.userData.threeMaterials                      │                │
│  │    - null: 使用原始材质                               │                │
│  │    - non-null: 使用高亮材质（原始材质被保存）        │                │
│  │                                                     │                │
│  │  关键: 高亮状态与可见性状态是独立的                   │                │
│  │        THREE.Mesh.visible 优先级高于材质              │                │
│  └─────────────────────────────────────────────────────┘                │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 状态同步的回调独立性

**关键架构特性**：可见性回调和选择回调是**完全独立**的。

```javascript
// website.js:914-919
onMeshVisibilityChanged: () => {
    this.UpdateMeshesVisibility();  // 只同步可见性
},
onMeshSelectionChanged: () => {
    this.UpdateMeshesSelection();   // 只同步高亮
},
```
- `source/website/website.js:914-919`

**独立性的影响**：
| 操作 | 触发的回调 | 同步的状态 |
|------|-----------|-----------|
| 隐藏/显示网格 | `onMeshVisibilityChanged` | 仅可见性 |
| 选择/取消选择 | `onMeshSelectionChanged` | 仅高亮 |
| 隔离操作 | 2次 `onMeshVisibilityChanged` | 仅可见性 |
| Show All | 1次 `onMeshVisibilityChanged` | 仅可见性 |

---

## 3. 核心收敛规则分析

### 3.1 规则零：Three.js 渲染优先级

**最高优先级规则**：`THREE.Mesh.visible` 决定是否渲染，与材质无关。

```javascript
// Three.js 渲染逻辑（概念）
if (mesh.visible) {
    renderer.renderMesh(mesh, mesh.material);  // 使用当前材质
} else {
    // 完全跳过，不关心 material 是什么
}
```

**关键推论**：
- 隐藏的网格即使材质被替换为高亮材质，也**不会渲染**
- 可见的网格使用当前材质（原始或高亮）渲染
- **视觉一致性由这一规则天然保证**

### 3.2 规则一：隐藏已选中对象的收敛

**场景描述**：用户选中 Mesh A，然后通过某种方式隐藏它。

#### 入口点分析

隐藏操作有多个入口点：

| 入口 | 代码位置 | 能否隐藏选中对象 |
|------|----------|-----------------|
| 导航面板眼睛图标 | `ToggleMeshVisibility()` | ✅ 可以 |
| 父节点隐藏 | `ToggleNodeVisibility()` | ✅ 可以（批量） |
| 右键菜单"Hide mesh" | `OnModelContextMenu()` | ❌ 只能隐藏可见对象 |
| 隔离操作 | `IsolateMesh()` | ✅ 可以（批量隐藏其他） |
| Show All (false) | `ShowAllMeshes(false)` | ✅ 可以（批量） |

**关键发现**：右键菜单无法隐藏已选中对象，因为 `GetMeshUserDataUnderMouse()` 会过滤隐藏物体。但其他入口点可以。

#### 状态转移流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 场景：选中 Mesh A，然后通过导航面板隐藏它                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  【初始状态】                                                             │
│  导航层:                                                                  │
│    • selection = Mesh A (选中)                                           │
│    • MeshItem[A].visible = true                                          │
│  渲染层:                                                                  │
│    • MeshA.visible = true                                                │
│    • MeshA.material = 高亮材质 (因为选中)                                │
│                                                                           │
│  【操作】点击导航面板中 Mesh A 的眼睛图标                                 │
│                                                                           │
│  【步骤 1】导航层可见性更新                                               │
│    ToggleMeshVisibility(MeshA)                                           │
│      → meshItem.SetVisible(false, NavigatorItemRecurse.Parents)         │
│      → 触发 onMeshVisibilityChanged 回调                                 │
│                                                                           │
│  【步骤 2】渲染层可见性同步                                               │
│    UpdateMeshesVisibility()                                              │
│      → 遍历所有网格，检查 navigator.IsMeshVisible()                       │
│      → MeshA.visible = false                                             │
│      → 调用 Render()                                                      │
│                                                                           │
│  【最终状态】                                                             │
│  导航层:                                                                  │
│    • selection = Mesh A (⚠️ 未变，仍指向隐藏对象)                        │
│    • MeshItem[A].visible = false                                         │
│  渲染层:                                                                  │
│    • MeshA.visible = false                                               │
│    • MeshA.material = 高亮材质 (⚠️ 未变，因为选择状态未变)               │
│                                                                           │
│  【渲染结果】                                                             │
│    MeshA 不渲染 (因为 visible = false)                                   │
│    ✅ 视觉上正确，用户看不到任何异常                                       │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

#### 状态一致性分析

| 状态维度 | 值 | 是否"一致" |
|----------|-----|-----------|
| 选择状态 → 可见性 | 选择指向隐藏对象 | ⚠️ 内部不一致 |
| 选择状态 → 高亮材质 | 高亮材质已应用 | ✅ 一致 |
| 可见性 → 渲染结果 | 隐藏的对象不渲染 | ✅ 一致 |

**关键洞察**：
- **内部状态不一致**：选择状态指向隐藏对象
- **视觉表现一致**：用户看不到任何异常
- 这是一种**懒惰收敛**或**视觉优先**的设计

### 3.3 规则二：隔离(Isolate)操作的状态生命周期

**操作定义**：隔离操作 = 隐藏所有 + 显示目标

```javascript
// navigatormeshespanel.js:502-506
IsolateMesh(meshInstanceId) {
    this.ShowAllMeshes(false);           // 步骤 1：隐藏所有
    this.ToggleMeshVisibility(meshInstanceId);  // 步骤 2：显示目标
}
```
- `source/website/navigatormeshespanel.js:502-506`

#### 完整状态转移（假设初始选中 Mesh A，隔离 Mesh B）

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 场景：选中 Mesh A，然后隔离 Mesh B                                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  【初始状态】                                                             │
│    selection = Mesh A                                                     │
│    所有网格 visible = true                                                │
│    MeshA 高亮，MeshB 正常                                                │
│                                                                           │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                           │
│  【步骤 1】ShowAllMeshes(false)                                           │
│                                                                           │
│  1.1 导航层更新                                                           │
│      EnumerateNodeItems → SetVisible(false, No)                         │
│      EnumerateMeshItems → SetVisible(false, No)                         │
│                                                                           │
│      注意: 使用 NavigatorItemRecurse.No                                  │
│            - 不向上递归重新计算父节点                                     │
│            - 不向下递归影响子节点                                         │
│            - 因为已经在遍历所有项，不需要递归                             │
│                                                                           │
│  1.2 触发回调                                                             │
│      onMeshVisibilityChanged()                                           │
│                                                                           │
│  1.3 渲染层同步                                                           │
│      UpdateMeshesVisibility()                                            │
│        → 所有网格 visible = false                                         │
│        → Render()                                                         │
│                                                                           │
│  【步骤 1 后状态】                                                        │
│    selection = Mesh A (⚠️ 仍指向隐藏对象)                                │
│    所有网格 visible = false                                               │
│    MeshA.material = 高亮材质 (未变)                                      │
│                                                                           │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                           │
│  【步骤 2】ToggleMeshVisibility(Mesh B)                                  │
│                                                                           │
│  2.1 导航层更新                                                           │
│      meshItem.SetVisible(!false, NavigatorItemRecurse.Parents)           │
│        → MeshB.visible = true                                            │
│        → 向上递归：重新计算父节点可见性                                   │
│                                                                           │
│  2.2 触发回调                                                             │
│      onMeshVisibilityChanged()                                           │
│                                                                           │
│  2.3 渲染层同步                                                           │
│      UpdateMeshesVisibility()                                            │
│        → MeshB.visible = true                                            │
│        → 其他网格保持 visible = false                                     │
│        → Render()                                                         │
│                                                                           │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                           │
│  【最终状态】                                                             │
│    selection = Mesh A (⚠️ 指向隐藏对象)                                  │
│    MeshA.visible = false, MeshA.material = 高亮材质                      │
│    MeshB.visible = true, MeshB.material = 原始材质                       │
│    其他网格 visible = false                                               │
│                                                                           │
│  【渲染结果】                                                             │
│    只有 MeshB 渲染，使用原始材质                                          │
│    MeshA 不渲染（虽然是选中状态）                                         │
│    ✅ 视觉上正确                                                           │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

#### 回调触发时序分析

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 隔离操作的回调时序                                                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  IsolateMesh(MeshB)                                                      │
│       │                                                                   │
│       ├──► ShowAllMeshes(false)                                          │
│       │         │                                                         │
│       │         └──► onMeshVisibilityChanged()                          │
│       │                  │                                                │
│       │                  └──► UpdateMeshesVisibility()                 │
│       │                           │                                       │
│       │                           └──► 全量同步：所有 visible = false   │
│       │                                 │                                  │
│       │                                 └──► Render()                    │
│       │                                                                   │
│       └──► ToggleMeshVisibility(MeshB)                                   │
│                 │                                                         │
│                 └──► onMeshVisibilityChanged()                          │
│                          │                                                │
│                          └──► UpdateMeshesVisibility()                 │
│                                   │                                       │
│                                   └──► 全量同步                          │
│                                        │   - MeshB.visible = true        │
│                                        │   - 其他保持不变                 │
│                                        │                                  │
│                                        └──► Render()                    │
│                                                                           │
│  关键特性：                                                                │
│  1. 每次回调都执行全量同步                                                │
│  2. 中间状态会被覆盖，最终状态收敛                                        │
│  3. 渲染同步窗口 = 每次 Render() 调用                                     │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.4 规则三：Show All 操作的状态恢复

**操作定义**：显示所有网格和节点

```javascript
// navigatormeshespanel.js:465-475
ShowAllMeshes(show) {
    this.EnumerateNodeItems((nodeItem) => {
        nodeItem.SetVisible(show, NavigatorItemRecurse.No);
        return true;
    });
    this.EnumerateMeshItems((meshItem) => {
        meshItem.SetVisible(show, NavigatorItemRecurse.No);
        return true;
    });
}
```
- `source/website/navigatormeshespanel.js:465-475`

#### 状态恢复分析（假设隔离后执行 Show All）

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 场景：隔离 Mesh B 后执行 Show All                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  【隔离后状态】                                                           │
│    selection = Mesh A (指向隐藏对象)                                      │
│    MeshA.visible = false, MeshA.material = 高亮材质                      │
│    MeshB.visible = true                                                   │
│                                                                           │
│  【操作】执行 ShowAllMeshes(true)                                         │
│                                                                           │
│  1. 导航层更新                                                             │
│     遍历所有节点和网格，设置 visible = true                                │
│     使用 NavigatorItemRecurse.No（因为已全量遍历）                       │
│                                                                           │
│  2. 触发回调                                                               │
│     onMeshVisibilityChanged() → UpdateMeshesVisibility()                 │
│                                                                           │
│  3. 渲染层同步                                                             │
│     所有网格 visible = true                                                │
│                                                                           │
│  【Show All 后状态】                                                      │
│    selection = Mesh A (⚠️ 未变，仍指向 Mesh A)                           │
│    MeshA.visible = true                                                   │
│    MeshA.material = 高亮材质 (因为选择状态未变)                           │
│                                                                           │
│  【渲染结果】                                                             │
│    MeshA 渲染，使用高亮材质 ✅                                             │
│    MeshB 渲染，使用原始材质                                               │
│                                                                           │
│  【关键发现】                                                             │
│    Show All 自动"修复"了选择状态与可见性的不一致！                        │
│    因为：                                                                  │
│      - 之前：selection = Mesh A, MeshA.visible = false (不一致)          │
│      - 之后：selection = Mesh A, MeshA.visible = true (一致)            │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Show All 的特殊角色

| 场景 | 选择状态 | Show All 后 |
|------|----------|-------------|
| 选中后隐藏 | 指向隐藏对象 | **自动恢复一致** |
| 隔离其他网格 | 指向原选择 | **原选择重新可见** |
| 正常选中 | 指向可见对象 | **保持一致** |

**设计意图**：Show All 不仅是显示所有，也是一种**状态重置**操作。

### 3.5 规则四：自修复机制

当选择状态指向隐藏对象时，系统有多种**自修复**途径：

#### 途径 1：点击三维视图空白区域

```javascript
// website.js:306-323
OnModelClicked(button, mouseCoordinates) {
    // ...
    let meshUserData = this.viewer.GetMeshUserDataUnderMouse(
        IntersectionMode.MeshAndLine, 
        mouseCoordinates
    );
    
    if (meshUserData === null) {
        // 点击到空白区域（或隐藏对象的位置）
        this.navigator.SetSelection(null);  // 清除选择
    } else {
        // 点击到可见对象
        this.navigator.SetSelection(
            new Selection(SelectionType.Mesh, meshUserData.originalMeshInstance.id)
        );
    }
}
```
- `source/website/website.js:306-323`

**关键**：`GetMeshUserDataUnderMouse()` 内部会过滤 `!visible` 的物体（见之前的报告）。

#### 途径 2：点击其他可见对象

- 点击可见对象会设置新的选择状态
- 原选择被自动清除

#### 途径 3：通过导航面板操作

- 点击其他网格：设置新选择
- 点击已选中的隐藏网格：切换选择（如果再次点击会取消）

#### 途径 4：Show All 操作

- 如规则三所述，Show All 会恢复可见性
- 选择状态仍然有效，视觉上恢复一致

---

## 4. 边界场景深度分析

### 4.1 场景 A：右键菜单隐藏 vs 导航面板隐藏

**关键差异**：

| 特性 | 右键菜单"Hide mesh" | 导航面板眼睛图标 |
|------|---------------------|------------------|
| 前置条件 | 必须点击可见对象 | 可操作任何对象 |
| 拾取过滤 | `GetMeshUserDataUnderMouse` 过滤隐藏对象 | 无过滤 |
| 能否隐藏已选中 | ❌ 不能（因为点击时它是可见的） | ✅ 可以 |

**右键菜单的隐藏流程**：
```
用户右键点击可见的 Mesh A（已选中）
    ↓
GetMeshUserDataUnderMouse() 返回 Mesh A（因为可见）
    ↓
选择"Hide mesh"
    ↓
ToggleMeshVisibility(Mesh A)
    ↓
隐藏后：selection 仍指向 Mesh A，但 Mesh A 已隐藏
```

**结论**：即使通过右键菜单，隐藏已选中对象也是可能的（因为点击时它是可见的）。

### 4.2 场景 B：父节点隐藏的级联效应

**操作**：隐藏包含选中网格的父节点

```javascript
// navigatormeshespanel.js:477-481
ToggleNodeVisibility(nodeId) {
    let nodeItem = this.GetNodeItem(nodeId);
    nodeItem.SetVisible(!nodeItem.IsVisible(), NavigatorItemRecurse.All);
}
```
- `source/website/navigatormeshespanel.js:477-481`

**递归模式 `All` 的含义**：
- 向下递归（Children）：所有子节点和子网格
- 向上递归（Parents）：重新计算父节点

**状态转移**：
```
父节点 Parent 包含 Mesh A（已选中）

隐藏 Parent:
  Parent.SetVisible(false, All)
    → 向下递归：Mesh A.visible = false
    → 触发 onMeshVisibilityChanged
    → UpdateMeshesVisibility: Mesh A.visible = false

最终状态:
  selection = Mesh A (指向隐藏对象)
  Mesh A.visible = false
  ✅ 视觉一致
```

### 4.3 场景 C：选择状态与导航面板 UI 显示

**潜在 UX 问题**：导航面板中隐藏的网格可能仍显示选中高亮。

让我验证这一点：

```javascript
// SetSelection 中的 UI 操作
navigator.meshesPanel.GetMeshItem(selection.meshInstanceId).SetSelected(select);

// SetVisible 中的 UI 操作
this.showHideButton.SetImage('visible' / 'hidden');
```

**分析**：
- `SetSelected()` 设置树形视图的背景高亮
- `SetVisible()` 只改变眼睛图标
- 两者是独立的 UI 状态

**可能的表现**：
```
导航面板树形视图:
├─ 📁 Parent Node [眼睛图标: 可见]
│  ├─ 📄 Mesh A [背景: 高亮选中] [眼睛图标: 隐藏]  ← 选中但隐藏
│  └─ 📄 Mesh B [背景: 正常] [眼睛图标: 可见]
```

**评估**：
- 这是一个**UX 问题**，不是功能性缺陷
- 用户可能困惑："为什么这个网格是高亮选中的，但眼睛图标是灰色的？"
- 但功能性是正确的：三维视图中 Mesh A 确实不渲染

### 4.4 场景 D：材质选择的特殊情况

回顾之前发现的**缺陷**：材质选择时三维视图不高亮。

**与可见性系统的交互**：
- 如果材质选择能正常工作，会高亮所有使用该材质的网格
- 可见性规则同样适用：隐藏的网格即使材质被高亮也不渲染
- 但目前这个功能是缺陷状态

---

## 5. 批量操作的回调时序与渲染同步

### 5.1 全量同步模式的优势

**核心设计**：每次可见性回调都执行全量同步。

```javascript
// website.js:454-459
UpdateMeshesVisibility() {
    this.viewer.SetMeshesVisibility((meshUserData) => {
        // 每次都查询导航层的当前状态
        return this.navigator.IsMeshVisible(meshUserData.originalMeshInstance.id);
    });
}
```
- `source/website/website.js:454-459`

**优势**：
1. **无状态依赖**：不依赖之前的渲染状态
2. **自动收敛**：多次调用的结果相同
3. **错误恢复**：即使中间状态有误，最终也能恢复正确

### 5.2 渲染同步窗口

**定义**：从状态变更到画面更新的时间窗口。

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 渲染同步时序                                                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  用户操作                                                                 │
│      │                                                                    │
│      ▼                                                                    │
│  导航层状态更新 (SetVisible)  ──────────────┐                           │
│      │                                      │                           │
│      ▼                                      │                           │
│  回调触发 (onMeshVisibilityChanged)          │  同步窗口                │
│      │                                      │                           │
│      ▼                                      │                           │
│  渲染层同步 (UpdateMeshesVisibility)        │                           │
│      │                                      │                           │
│      ▼                                      │                           │
│  Render() 调用 ◄────────────────────────────┘                           │
│                                                                           │
│  关键特性：                                                                │
│  - 同步窗口内画面保持不变                                                  │
│  - 同步窗口通常很短（微秒级）                                             │
│  - 批量操作可能有多个同步窗口                                             │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.3 隔离操作的多窗口分析

```
IsolateMesh(MeshB) 执行过程:

时间线 ─────────────────────────────────────────────────────────────────►

t0: 用户点击"Isolate mesh"
    │
t1: ShowAllMeshes(false)
    │  ├─ 遍历所有节点，设置 visible = false
    │  ├─ 遍历所有网格，设置 visible = false
    │  └─ 触发 onMeshVisibilityChanged [第 1 次]
    │
t2: UpdateMeshesVisibility() [第 1 次]
    │  ├─ 全量查询导航层状态
    │  ├─ 所有网格 visible = false
    │  └─ Render() [画面 1：全黑]
    │
t3: ToggleMeshVisibility(MeshB)
    │  ├─ MeshB.visible = true
    │  ├─ 向上递归父节点
    │  └─ 触发 onMeshVisibilityChanged [第 2 次]
    │
t4: UpdateMeshesVisibility() [第 2 次]
    │  ├─ 全量查询导航层状态
    │  ├─ MeshB.visible = true，其他保持 false
    │  └─ Render() [画面 2：只有 MeshB]
    │
t5: 用户看到最终结果
```

**用户感知**：
- 画面 1（全黑）可能非常短暂，用户可能察觉不到
- 最终只有画面 2 稳定显示

### 5.4 回调独立性的影响

**关键问题**：可见性变化是否应该触发选择状态的重新评估？

**当前设计**：不触发。

**论点分析**：

| 支持自动清除 | 支持保持选择 |
|-------------|-------------|
| 隐藏的对象无法交互，选择它无意义 | 用户可能只是暂时隐藏，稍后恢复查看 |
| 选择状态指向不可达对象，概念上"无效" | Show All 会自动恢复一致性 |
| 导航面板 UX 可能困惑（选中但隐藏） | 避免意外丢失选择状态 |

**当前行为**：选择状态保持不变，依赖**懒惰收敛**。

---

## 6. 收敛规则总结表

### 6.1 状态转移总表

| 操作 | 选择状态 | 高亮材质 | 可见性 | 视觉一致性 |
|------|----------|----------|--------|-----------|
| 选中可见对象 | 指向该对象 | 应用到该对象 | 不变 | ✅ |
| 隐藏已选中对象 | **保持不变** | **保持不变** | 对象隐藏 | ✅ (不渲染) |
| 隔离操作 | **指向原选择** | **保持不变** | 只有目标可见 | ✅ |
| Show All | 保持不变 | 保持不变 | 所有可见 | ✅ (选择恢复可见) |
| 点击空白区域 | **被清除** | **被清除** | 不变 | ✅ |
| 点击其他可见对象 | 指向新对象 | 应用到新对象 | 不变 | ✅ |

### 6.2 自修复途径总表

| 途径 | 触发条件 | 修复效果 |
|------|----------|----------|
| 点击空白 | 选择指向隐藏对象时点击空白 | 清除选择 |
| 点击其他可见对象 | 任何时候 | 设置新选择 |
| 导航面板操作 | 点击其他网格 | 设置新选择 |
| Show All | 任何时候 | 恢复所有可见性 |

### 6.3 递归模式使用场景

| 递归模式 | 使用场景 | 原因 |
|----------|----------|------|
| `No` | `ShowAllMeshes` | 已全量遍历，无需递归 |
| `Parents` | `ToggleMeshVisibility` | 子节点变化需要重新计算父节点 |
| `All` | `ToggleNodeVisibility` | 父节点变化需要级联子节点 + 重新计算上级 |

---

## 7. 问题与建议

### 7.1 已确认的问题

| 问题 | 严重程度 | 类型 |
|------|----------|------|
| 材质选择不高亮 | 🔴 高 | 功能性缺陷 |
| 边缘模型不高亮 | 🟡 中 | 视觉缺陷 |
| 导航面板选中但隐藏的 UX | 🟡 中 | 用户体验 |

### 7.2 架构设计评价

**优点**：
1. **视觉一致性始终保证**：Three.js 的 `visible` 优先级确保渲染结果正确
2. **全量同步简化设计**：无需跟踪增量变化，降低复杂度
3. **懒惰收敛避免意外**：选择状态不会被意外清除

**潜在改进点**：
1. **导航面板 UX**：隐藏的网格应该取消选中高亮背景
2. **材质选择功能**：需要修复以保持一致性
3. **边缘模型高亮**：需要同步处理

### 7.3 建议的改进

**建议 1：导航面板 UX 优化**

当用户隐藏已选中的网格时，考虑：
- 自动清除选择（激进方案）
- 或在导航面板中视觉区分"选中但隐藏"的状态（保守方案）

**建议 2：修复材质选择高亮**

如前一份报告所述，需要修改 `UpdateMeshesSelection` 来处理材质选择。

**建议 3：修复边缘模型高亮**

需要在 `SetMeshesHighlight` 中添加对 `edgeModel` 的处理。

---

## 8. 关键代码索引

| 功能 | 文件 | 关键方法 |
|------|------|----------|
| 隔离操作 | `navigatormeshespanel.js` | `IsolateMesh()` |
| 批量显示/隐藏 | `navigatormeshespanel.js` | `ShowAllMeshes()` |
| 切换单个网格可见性 | `navigatormeshespanel.js` | `ToggleMeshVisibility()` |
| 切换节点可见性 | `navigatormeshespanel.js` | `ToggleNodeVisibility()` |
| 可见性同步 | `website.js` | `UpdateMeshesVisibility()` |
| 高亮同步 | `website.js` | `UpdateMeshesSelection()` |
| 点击处理 | `website.js` | `OnModelClicked()` |
| 右键菜单 | `website.js` | `OnModelContextMenu()` |
| 节点可见性设置 | `navigatoritems.js` | `NodeItem.SetVisible()` |
| 网格可见性设置 | `navigatoritems.js` | `MeshItem.SetVisible()` |
| 父节点可见性计算 | `navigatoritems.js` | `NodeItem.CalculateIsVisible()` |

---

*报告生成时间：2026-05-01*
*分析基于 Online3DViewer 代码库版本：当前工作目录版本*
