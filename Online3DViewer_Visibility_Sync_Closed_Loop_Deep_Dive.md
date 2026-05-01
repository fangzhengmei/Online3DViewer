# Online3DViewer 节点可见性同步闭环深入分析

## 1. 引言

本报告深入分析 Online3DViewer 中节点隐藏/显示操作的完整同步闭环，重点关注：
- UI 层可见性状态如何同步到三维渲染层
- 三维视图交互（拾取、右键菜单）如何感知并回传隐藏状态
- 边界场景下状态一致性的保证机制

---

## 2. 可见性状态管理架构

### 2.1 状态存储的双重性

Online3DViewer 采用**双重状态存储**设计：

| 层级 | 存储位置 | 状态表示 | 访问方式 |
|------|----------|----------|----------|
| **UI 层** | `MeshItem.visible` / `NodeItem.visible` | `boolean` | `IsVisible()` / `SetVisible()` |
| **渲染层** | `THREE.Mesh.visible` | `boolean` | 直接访问属性 |

**核心设计原则**：UI 层状态是**唯一真值源（Single Source of Truth）**，渲染层状态由 UI 层同步派生。

### 2.2 递归模式定义

在 `navigatoritems.js:4-10` 中定义了四种递归模式：

```javascript
export const NavigatorItemRecurse = {
    No: 0,         // 不递归，仅影响当前项
    Parents: 1,    // 向上递归影响父节点
    Children: 2,   // 向下递归影响子节点
    All: 3         // 双向递归（父节点 + 子节点）
};
```
- `source/website/navigatoritems.js:4-10`

---

## 3. UI 层可见性操作详解

### 3.1 MeshItem 的可见性处理

`MeshItem` 是单个网格实例的 UI 表示：

```javascript
export class MeshItem extends TreeViewButtonItem {
    constructor(name, icon, meshInstanceId, callbacks) {
        // ...
        this.visible = true;  // 初始可见
        // ...
    }

    SetVisible(visible, recurse) {
        // 1. 短路优化：状态未变化则直接返回
        if (this.visible === visible) {
            return;
        }
        
        // 2. 更新内部状态
        this.visible = visible;
        
        // 3. 更新 UI 图标
        if (this.visible) {
            this.showHideButton.SetImage('visible');
        } else {
            this.showHideButton.SetImage('hidden');
        }
        
        // 4. 向上递归处理父节点（关键！）
        if (recurse === NavigatorItemRecurse.Parents) {
            if (this.parent instanceof NodeItem) {
                let parentIsVisible = this.parent.CalculateIsVisible();
                this.parent.SetVisible(parentIsVisible, NavigatorItemRecurse.Parents);
            }
        }
    }
}
```
- `source/website/navigatoritems.js:23-77`

**关键点分析**：

1. **短路优化**：`if (this.visible === visible) return;` 避免不必要的状态更新和回调触发。

2. **父节点联动**：当 `recurse === Parents` 时，会触发父节点的可见性重新计算。这是实现"隐藏所有子节点后父节点自动隐藏"的核心机制。

### 3.2 NodeItem 的可见性处理

`NodeItem` 是节点（可包含子节点和网格）的 UI 表示，逻辑更为复杂：

```javascript
export class NodeItem extends TreeViewGroupButtonItem {
    constructor(name, nodeId, callbacks) {
        // ...
        this.visible = true;
        // ...
    }

    // 计算节点是否应该"显示"（只要有一个子项可见就算可见）
    CalculateIsVisible() {
        let isVisible = false;
        for (let child of this.children) {
            if (child instanceof NodeItem || child instanceof MeshItem) {
                if (child.IsVisible()) {
                    isVisible = true;
                    break;  // 找到一个可见的就立即返回
                }
            }
        }
        return isVisible;
    }

    SetVisible(visible, recurse) {
        // 1. 短路优化
        if (this.visible === visible) {
            return;
        }
        
        // 2. 更新状态和 UI
        this.visible = visible;
        if (this.visible) {
            this.showHideButton.SetImage('visible');
        } else {
            this.showHideButton.SetImage('hidden');
        }
        
        // 3. 通知回调（用于根节点更新工具栏图标）
        if (IsDefined(this.callbacks.onVisibilityChanged)) {
            this.callbacks.onVisibilityChanged(this.visible);
        }
        
        // 4. 向下递归：设置所有子节点
        if (recurse === NavigatorItemRecurse.Children || recurse === NavigatorItemRecurse.All) {
            for (let child of this.children) {
                if (child instanceof NodeItem || child instanceof MeshItem) {
                    child.SetVisible(this.visible, NavigatorItemRecurse.Children);
                }
            }
        }
        
        // 5. 向上递归：重新计算父节点可见性
        if (recurse === NavigatorItemRecurse.Parents || recurse === NavigatorItemRecurse.All) {
            if (this.parent instanceof NodeItem) {
                let parentIsVisible = this.parent.CalculateIsVisible();
                this.parent.SetVisible(parentIsVisible, NavigatorItemRecurse.Parents);
            }
        }
    }
}
```
- `source/website/navigatoritems.js:79-164`

**关键点分析**：

1. **`CalculateIsVisible()` 的语义**：
   - 这不是获取当前 `this.visible` 的值
   - 而是**根据子节点状态计算应该是什么值**
   - 采用"或"逻辑：有任何子节点可见，则节点应该可见

2. **递归方向的巧妙设计**：
   - **向下递归**（Children）：父节点隐藏时，所有子节点都要隐藏
   - **向上递归**（Parents）：子节点状态变化后，父节点需要重新计算

### 3.3 触发可见性操作的入口

在 `navigatormeshespanel.js` 中定义了各种操作入口：

```javascript
// 切换单个网格可见性
ToggleMeshVisibility(meshInstanceId) {
    let meshItem = this.GetMeshItem(meshInstanceId);
    meshItem.SetVisible(!meshItem.IsVisible(), NavigatorItemRecurse.Parents);
}

// 切换节点可见性
ToggleNodeVisibility(nodeId) {
    let nodeItem = this.GetNodeItem(nodeId);
    nodeItem.SetVisible(!nodeItem.IsVisible(), NavigatorItemRecurse.All);
}

// 显示/隐藏所有
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

// 隔离网格
IsolateMesh(meshInstanceId) {
    this.ShowAllMeshes(false);           // 先隐藏所有
    this.ToggleMeshVisibility(meshInstanceId);  // 再显示目标
}
```
- `source/website/navigatormeshespanel.js:477-506`

**递归模式选择策略**：

| 操作 | 递归模式 | 原因 |
|------|----------|------|
| `ToggleMeshVisibility` | `Parents` | 单个网格变化只需要向上同步父节点 |
| `ToggleNodeVisibility` | `All` | 节点变化需要向下（子节点）+ 向上（父节点） |
| `ShowAllMeshes` | `No` | 全量遍历，每个项单独处理，不需要递归 |

---

## 4. 从 UI 层到渲染层的同步

### 4.1 回调链设计

同步通过**回调链**实现，而非直接依赖：

```
[MeshItem 眼睛图标被点击]
         ↓
[NavigatorMeshesPanel.onMeshShowHide 回调]
         ↓
[Navigator.ToggleMeshVisibility]
         ↓
[Navigator.callbacks.onMeshVisibilityChanged]
         ↓
[Website.UpdateMeshesVisibility]
         ↓
[Viewer.SetMeshesVisibility]
         ↓
[Three.js mesh.visible 属性更新]
         ↓
[Viewer.Render()]
```

### 4.2 核心同步方法

#### 步骤 1：Navigator 层触发回调

```javascript
// navigator.js:184-188
ToggleMeshVisibility(meshInstanceId) {
    this.meshesPanel.ToggleMeshVisibility(meshInstanceId);
    this.callbacks.onMeshVisibilityChanged();  // 关键！
}
```
- `source/website/navigator.js:184-188`

#### 步骤 2：Website 层执行同步

```javascript
// website.js:454-459
UpdateMeshesVisibility() {
    this.viewer.SetMeshesVisibility((meshUserData) => {
        // 以 UI 层状态为准，查询每个网格是否应该可见
        return this.navigator.IsMeshVisible(meshUserData.originalMeshInstance.id);
    });
}
```
- `source/website/website.js:454-459`

#### 步骤 3：Viewer 层更新渲染对象

```javascript
// viewer.js:449-464
SetMeshesVisibility(isVisible) {
    // 1. 更新主模型的网格和线段
    this.mainModel.EnumerateMeshesAndLines((mesh) => {
        let visible = isVisible(mesh.userData);  // 调用回调判断
        if (mesh.visible !== visible) {
            mesh.visible = visible;  // 更新 Three.js 属性
        }
    });
    
    // 2. 同步更新边缘模型（用于线框显示）
    this.mainModel.EnumerateEdges((edge) => {
        let visible = isVisible(edge.userData);
        if (edge.visible !== visible) {
            edge.visible = visible;
        }
    });
    
    this.Render();  // 触发重绘
}
```
- `source/engine/viewer/viewer.js:449-464`

### 4.3 同步策略分析

**拉模式（Pull Model）**：

这是一个典型的**拉模式**设计：
- 不是 UI 层主动推送变更给渲染层
- 而是渲染层在同步时**拉取**UI 层的最新状态

```javascript
// 每次同步都重新查询所有网格
this.viewer.SetMeshesVisibility((meshUserData) => {
    return this.navigator.IsMeshVisible(meshUserData.originalMeshInstance.id);
});
```

**优势**：
1. **状态一致性保证**：不管中间经过多少操作，最终以 UI 层为准
2. **简化状态跟踪**：不需要记录"哪些网格变了"，全量同步即可
3. **易于调试**：任何时候调用都能恢复一致状态

**潜在代价**：
- 每次都要遍历所有网格对象
- 对于超大型模型（10万+网格）可能有性能影响

**优化措施**：
```javascript
// 只有真正变化时才更新 Three.js 属性
if (mesh.visible !== visible) {
    mesh.visible = visible;
}
```
- 虽然全量遍历，但实际写操作只发生在有变化的对象上

---

## 5. 从渲染层回传到 UI 层：拾取机制

### 5.1 隐藏节点的拾取过滤

这是同步闭环中**最关键**的一环：隐藏的节点不应该被鼠标拾取到。

```javascript
// viewermodel.js:301-340
GetMeshIntersectionUnderMouse(intersectionMode, mouseCoords, camera, width, height) {
    // ... 射线准备 ...
    
    // 执行相交检测
    let iSectObjects = raycaster.intersectObject(
        this.mainModel.GetRootObject(), 
        true  // 递归检测子节点
    );
    
    // 过滤不可见物体！
    for (let i = 0; i < iSectObjects.length; i++) {
        let iSectObject = iSectObjects[i];
        
        // 关键检查：跳过不可见物体
        if (!iSectObject.object.visible) {
            continue;
        }
        
        // ... 类型判断和返回 ...
        return iSectObject;
    }
    
    return null;
}
```
- `source/engine/viewer/viewermodel.js:301-340`

**关键点**：
1. `raycaster.intersectObject()` 本身**不会**自动过滤 `visible = false` 的物体
2. Online3DViewer 在遍历检测结果时**手动过滤**了不可见物体
3. 这是保证"隐藏节点不可拾取"的核心防线

### 5.2 拾取后的 UI 同步

当用户点击三维视图时，拾取结果会同步到 UI 选择状态：

```javascript
// website.js:306-323
OnModelClicked(button, mouseCoordinates) {
    if (button !== 1) {  // 只处理左键
        return;
    }
    
    // ... 测量工具检查 ...
    
    // 执行拾取（内部已过滤不可见物体）
    let meshUserData = this.viewer.GetMeshUserDataUnderMouse(
        IntersectionMode.MeshAndLine, 
        mouseCoordinates
    );
    
    if (meshUserData === null) {
        // 点击到空白区域：清除选择
        this.navigator.SetSelection(null);
    } else {
        // 点击到可见物体：同步选择状态
        this.navigator.SetSelection(
            new Selection(SelectionType.Mesh, meshUserData.originalMeshInstance.id)
        );
    }
}
```
- `source/website/website.js:306-323`

### 5.3 右键菜单的状态感知

右键菜单也会根据拾取结果动态调整选项：

```javascript
// website.js:332-392
OnModelContextMenu(globalMouseCoordinates, mouseCoordinates) {
    let meshUserData = this.viewer.GetMeshUserDataUnderMouse(
        IntersectionMode.MeshAndLine, 
        mouseCoordinates
    );
    
    let items = [];
    if (meshUserData === null) {
        // 点击到空白或隐藏物体
        items.push({
            name: Loc('Fit model to window'),
            // ...
        });
        
        // 关键：只有存在隐藏网格时才显示"显示所有"
        if (this.navigator.HasHiddenMesh()) {
            items.push({
                name: Loc('Show all meshes'),
                icon: 'visible',
                onClick: () => {
                    this.navigator.ShowAllMeshes(true);
                }
            });
        }
    } else {
        // 点击到可见物体
        items.push({
            name: Loc('Hide mesh'),  // 提供隐藏选项
            icon: 'hidden',
            onClick: () => {
                this.navigator.ToggleMeshVisibility(meshUserData.originalMeshInstance.id);
            }
        });
        // ... 其他选项 ...
    }
    // ... 显示菜单 ...
}
```
- `source/website/website.js:332-392`

**状态感知点**：

| 场景 | 判断条件 | 菜单行为 |
|------|----------|----------|
| 点击到可见物体 | `meshUserData !== null` | 显示"Hide mesh"选项 |
| 点击到空白/隐藏物体 | `meshUserData === null` | 不显示隐藏选项 |
| 存在隐藏网格 | `navigator.HasHiddenMesh()` | 额外显示"Show all meshes" |

---

## 6. 完整同步闭环图

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              UI 层 (Navigator)                                    │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  MeshItem.visible / NodeItem.visible                                     │   │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                │   │
│  │  │  MeshItem A │    │  MeshItem B │    │  MeshItem C │                │   │
│  │  │  visible=T  │    │  visible=F  │    │  visible=T  │                │   │
│  │  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘                │   │
│  │         └───────────────────┼───────────────────┘                       │   │
│  │                             ▼                                               │   │
│  │                  ┌──────────────────┐                                      │   │
│  │                  │   NodeItem (父)  │                                      │   │
│  │                  │ CalculateIsVisible│◄──── 根据子节点重新计算            │   │
│  │                  └────────┬─────────┘                                      │   │
│  └───────────────────────────┼──────────────────────────────────────────────────┘   │
│                              │                                                        │
│  ┌───────────────────────────▼──────────────────────────────────────────────────┐   │
│  │                         操作入口                                                │   │
│  │  SetVisible(recurse)   ToggleMeshVisibility()   ToggleNodeVisibility()      │   │
│  └───────────────────────────┬──────────────────────────────────────────────────┘   │
└──────────────────────────────┼─────────────────────────────────────────────────────────┘
                               │ onMeshVisibilityChanged 回调
                               ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          Website 层 (协调层)                                      │
│                                                                                     │
│   UpdateMeshesVisibility()                                                         │
│   {                                                                                 │
│       viewer.SetMeshesVisibility((userData) => {                                  │
│           return navigator.IsMeshVisible(                                         │
│               userData.originalMeshInstance.id    ◄──── 以 UI 层为准            │
│           );                                                                        │
│       });                                                                           │
│   }                                                                                 │
│                                                                                     │
└──────────────────────────────┬─────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          Viewer 层 (渲染控制)                                     │
│                                                                                     │
│   SetMeshesVisibility(isVisible)                                                   │
│   {                                                                                 │
│       EnumerateMeshesAndLines((mesh) => {                                         │
│           let visible = isVisible(mesh.userData);                                 │
│           if (mesh.visible !== visible) {                                          │
│               mesh.visible = visible;  ◄──── 更新 Three.js 属性                  │
│           }                                                                         │
│       });                                                                           │
│       Render();  ◄──── 触发重绘                                                    │
│   }                                                                                 │
│                                                                                     │
└──────────────────────────────┬─────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        Three.js 层 (实际渲染)                                     │
│                                                                                     │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  THREE.Mesh.visible                                                        │   │
│   │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                │   │
│   │  │  Mesh A     │    │  Mesh B     │    │  Mesh C     │                │   │
│   │  │  visible=T  │    │  visible=F  │    │  visible=T  │                │   │
│   │  └─────────────┘    └─────────────┘    └─────────────┘                │   │
│   │                                                                             │   │
│   │  注意：Mesh B 虽然不可见，但仍在场景图中，只是不参与渲染和拾取           │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│   拾取检测（过滤不可见物体）：                                                       │
│   GetMeshIntersectionUnderMouse() {                                                │
│       for (intersection of allIntersections) {                                     │
│           if (!intersection.object.visible) {                                      │
│               continue;  ◄──── 关键：跳过隐藏物体                                  │
│           }                                                                         │
│           return intersection;                                                      │
│       }                                                                             │
│   }                                                                                 │
└──────────────────────────────┬─────────────────────────────────────────────────────────┘
                               │
                               │ 拾取结果（只包含可见物体）
                               ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          交互回传路径                                              │
│                                                                                     │
│   用户点击三维视图                                                                  │
│         ↓                                                                           │
│   OnModelClicked() / OnModelContextMenu()                                          │
│         ↓                                                                           │
│   GetMeshUserDataUnderMouse()  ◄──── 内部已过滤隐藏物体                           │
│         ↓                                                                           │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  拾取结果处理：                                                             │   │
│   │  - 点击到可见物体 → SetSelection(meshId) → 高亮 → UI 同步               │   │
│   │  - 点击到隐藏/空白 → SetSelection(null) → 清除高亮                       │   │
│   │  - 右键菜单 → 根据 HasHiddenMesh() 动态显示"显示所有"选项               │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. 边界场景与状态一致性保证

### 7.1 场景 1：视图切换（TreeView ↔ FlatList）

**问题**：切换视图模式时，UI 组件会重建，如何保存和恢复可见性状态？

**解决方案**：在 `FillButtons()` 中的 `UpdateView()` 函数

```javascript
// navigatormeshespanel.js:208-228
function UpdateView(panel, importResult) {
    // 1. 保存当前隐藏状态
    let hiddenMeshInstanceIds = [];
    panel.EnumerateMeshItems((meshItem) => {
        if (!meshItem.IsVisible()) {
            hiddenMeshInstanceIds.push(meshItem.GetMeshInstanceId());
        }
        return true;
    });

    // 2. 清空并重建树
    panel.ClearMeshTree();
    panel.FillMeshTree(importResult.model);

    // 3. 恢复隐藏状态
    for (let meshInstanceId of hiddenMeshInstanceIds) {
        let meshItem = panel.GetMeshItem(meshInstanceId);
        meshItem.SetVisible(false, NavigatorItemRecurse.Parents);
    }

    // ...
}
```
- `source/website/navigatormeshespanel.js:208-228`

**关键点**：
1. 使用 `NavigatorItemRecurse.Parents` 恢复，确保父节点也被正确设置
2. 状态保存在 `meshInstanceId` 层面，与视图模式无关

### 7.2 场景 2：隔离操作（Isolate）

**问题**：隔离操作涉及"先隐藏所有，再显示一个"，如何保证中间状态的一致性？

**实现**：
```javascript
// navigatormeshespanel.js:502-506
IsolateMesh(meshInstanceId) {
    this.ShowAllMeshes(false);           // 步骤 1：隐藏所有
    this.ToggleMeshVisibility(meshInstanceId);  // 步骤 2：显示目标
}
```
- `source/website/navigatormeshespanel.js:502-506`

**同步机制**：
- `ShowAllMeshes(false)` 会触发 `onMeshVisibilityChanged` 回调吗？
- 查看代码：`ShowAllMeshes` 只是设置 UI 状态，**不直接触发回调**
- 后续的 `ToggleMeshVisibility` 才会触发回调
- 但实际测试中，每步操作后渲染层都是同步的

**实际调用链**（在 website.js 中）：
```javascript
// navigator.js:195-199
IsolateMesh(meshInstanceId) {
    this.meshesPanel.IsolateMesh(meshInstanceId);
    this.callbacks.onMeshVisibilityChanged();  // 只触发一次
}
```

**优势**：批量操作只触发一次同步，减少不必要的渲染。

### 7.3 场景 3：全显示操作（Show All）

**问题**：如何判断是否需要显示"显示所有"选项？

**实现**：
```javascript
// navigatormeshespanel.js:452-463
HasHiddenMesh() {
    let hasHiddenMesh = false;
    this.EnumerateMeshItems((meshItem) => {
        if (!meshItem.IsVisible()) {
            hasHiddenMesh = true;
            return false;  // 找到一个就立即返回
        }
        return true;
    });
    return hasHiddenMesh;
}
```
- `source/website/navigatormeshespanel.js:452-463`

**使用场景**：右键菜单动态决定是否显示"显示所有"选项

### 7.4 场景 4：包围盒计算的可见性过滤

**问题**：计算包围盒时应该只考虑可见物体？

**实现**：
```javascript
// website.js:422-432
FitModelToWindow(onLoad) {
    let animation = !onLoad;
    let boundingSphere = this.viewer.GetBoundingSphere((meshUserData) => {
        // 关键：只考虑可见网格
        return this.navigator.IsMeshVisible(meshUserData.originalMeshInstance.id);
    });
    // ...
}
```
- `source/website/website.js:422-432`

**同样的模式**：
- `GetBoundingBox()` 和 `GetBoundingSphere()` 都接受一个过滤回调
- 调用者决定哪些物体应该被计算

```javascript
// viewermodel.js:203-217
GetBoundingBox(needToProcess) {
    let hasMesh = false;
    let boundingBox = new THREE.Box3();
    this.EnumerateMeshesAndLines((mesh) => {
        if (needToProcess(mesh.userData)) {  // 回调过滤
            boundingBox.union(new THREE.Box3().setFromObject(mesh));
            hasMesh = true;
        }
    });
    // ...
}
```
- `source/engine/viewer/viewermodel.js:203-217`

### 7.5 场景 5：模型加载完成后的初始状态

**问题**：新加载的模型可见性状态是什么？

**实现**：
```javascript
// navigatoritems.js
class MeshItem extends TreeViewButtonItem {
    constructor(...) {
        this.visible = true;  // 默认可见
    }
}

class NodeItem extends TreeViewGroupButtonItem {
    constructor(...) {
        this.visible = true;  // 默认可见
    }
}
```

**加载流程**：
1. 模型加载 → `OnModelLoaded()`
2. `navigator.FillTree(importResult)` → 创建新的 `MeshItem`/`NodeItem`
3. 新建的项 `visible = true`
4. 然后触发选择变化、可见性变化等回调

**清空流程**：
```javascript
// website.js:280-293
ClearModel() {
    // ...
    this.viewer.Clear();  // 清空渲染层
    this.navigator.Clear();  // 清空 UI 状态
    // ...
}
```

---

## 8. 状态一致性设计总结

### 8.1 核心设计原则

| 原则 | 实现方式 | 代码位置 |
|------|----------|----------|
| **单一真值源** | UI 层状态是唯一来源，渲染层派生 | `UpdateMeshesVisibility()` 拉取 UI 状态 |
| **全量同步** | 每次同步都重新计算所有网格 | `SetMeshesVisibility()` 遍历所有对象 |
| **短路优化** | 状态未变化时不执行操作 | `if (this.visible === visible) return;` |
| **双向过滤** | 渲染时和拾取时都过滤不可见物体 | `mesh.visible` 属性 + 拾取时检查 |
| **递归联动** | 父子节点状态自动联动 | `CalculateIsVisible()` + 递归调用 |

### 8.2 一致性保障点

```
操作前                                    操作后
  │                                          │
  │   1. UI 层状态更新（带递归和短路）        │
  │      SetVisible(visible, recurse)       │
  │                                          │
  │   2. 回调触发                            │
  │      onMeshVisibilityChanged()           │
  │                                          │
  │   3. 渲染层同步                          │
  │      SetMeshesVisibility()               │
  │      ├─ 遍历所有网格                      │
  │      ├─ 以 UI 状态为准                   │
  │      └─ 更新 mesh.visible + Render()     │
  │                                          │
  ▼                                          ▼
一致性保障：
- 任何时候调用 UpdateMeshesVisibility() 都能恢复一致状态
- 拾取时自动过滤隐藏物体，不会破坏选择状态
- 视图切换时保存和恢复状态，不丢失用户操作
```

### 8.3 潜在的一致性风险

虽然当前设计相当健壮，但仍存在一些理论上的风险点：

| 风险场景 | 可能性 | 当前防护 |
|----------|--------|----------|
| 回调链中断导致不同步 | 低 | 全量同步模式，下次操作会自动修复 |
| 直接修改 Three.js 场景绕过 UI | 低 | 架构上不鼓励，代码中无此操作 |
| 多线程/异步操作竞争 | 无 | JavaScript 单线程，无此问题 |
| 递归死循环 | 低 | 树结构，父节点唯一，向上递归有终点 |

---

## 9. 关键代码索引

| 功能 | 文件 | 关键方法/类 |
|------|------|-------------|
| UI 可见性状态 | `navigatoritems.js` | `MeshItem.SetVisible()`, `NodeItem.SetVisible()`, `CalculateIsVisible()` |
| 操作入口 | `navigatormeshespanel.js` | `ToggleMeshVisibility()`, `ToggleNodeVisibility()`, `IsolateMesh()`, `ShowAllMeshes()` |
| 同步到渲染层 | `website.js` | `UpdateMeshesVisibility()`, `UpdateMeshesSelection()` |
| 渲染层可见性 | `viewer.js` | `SetMeshesVisibility()`, `SetMeshesHighlight()` |
| 拾取过滤 | `viewermodel.js` | `GetMeshIntersectionUnderMouse()` |
| 拾取回传 | `website.js` | `OnModelClicked()`, `OnModelContextMenu()` |
| 包围盒过滤 | `viewermodel.js` | `GetBoundingBox()`, `GetBoundingSphere()` |
| 视图切换状态保存 | `navigatormeshespanel.js` | `UpdateView()` |

---

*报告生成时间：2026-05-01*
*分析基于 Online3DViewer 代码库版本：当前工作目录版本*
