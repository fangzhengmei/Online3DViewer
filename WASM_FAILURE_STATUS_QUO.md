# Online3DViewer WebAssembly 失败场景现状对账报告

> 本文档基于 **当前代码实现** 逐项对账四类失败场景，清晰区分「现状事实」与「改进建议」。

---

## 对账说明

| 项目 | 定义 |
|------|------|
| **触发条件** | 导致该类失败的具体代码路径 |
| **状态收敛结果** | 失败后最终到达的状态 |
| **错误回传口径** | 错误信息的传递方式和内容 |
| **资源回收时点** | 资源清理的时机和完整性 |
| **收敛判据** | 可验证的收敛标志 |

---

## 场景 1: 加载失败 (Load Failed)

### 1.1 现状事实

#### 触发条件

**代码位置**: `source/engine/io/externallibs.js:18-20`

```javascript
scriptElement.onerror = () => {
    reject ();
};
```

**具体触发场景**:
- 网络连接失败
- CDN 返回 404 / 5xx 错误
- CORS 跨域限制
- 脚本解析错误（语法错误等）

**涉及的导入器**:
- `Importer3dm` (rhino3dm)
- `ImporterIfc` (web-ifc)
- `ImporterGltf` (draco3d)
- `ImporterOcct` / `ImporterFcstd` (通过 `CreateOcctWorker` 中的 `fetch`)

#### 状态收敛结果

**正常收敛路径** (以 `Importer3dm` 为例):

```
┌─────────────────────────────────────────────────────────────────┐
│                    加载失败的收敛路径                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. LoadExternalLibraryFromUrl()                                │
│     └── scriptElement.onerror → reject()                        │
│                                                                 │
│  2. 调用层 .catch() 捕获                                        │
│     代码位置: importer3dm.js:57-60                             │
│     └── SetError(Loc('Failed to load rhino3dm.'))              │
│     └── onFinish()                                              │
│                                                                 │
│  3. CreateResult() 处理                                         │
│     代码位置: importerbase.js:46-51                            │
│     └── this.error === true                                     │
│     └── callbacks.onError()                                     │
│     └── callbacks.onComplete()                                  │
│                                                                 │
│  4. 上层回调处理                                                 │
│     代码位置: importer.js:238-246                              │
│     ├── onError: 创建 ImportError(code=ImportFailed)           │
│     └── onComplete: importer.Clear()                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**收敛结果**: ✅ 正常收敛

| 检查项 | 现状值 |
|--------|--------|
| `this.error` | `true` |
| `onError` 回调 | ✅ 被调用 |
| `onComplete` 回调 | ✅ 被调用 |
| `importer.Clear()` | ✅ 被调用 |

#### 错误回传口径

**代码位置**: `source/engine/import/importer3dm.js:58`, `importerifc.js:53`, `importergltf.js:291`

| 导入器 | 错误消息 |
|--------|---------|
| `Importer3dm` | `'Failed to load rhino3dm.'` |
| `ImporterIfc` | `'Failed to load web-ifc.'` |
| `ImporterGltf` (Draco) | `'Failed to load draco decoder.'` |
| `ImporterOcct` / `ImporterFcstd` | `'Failed to load occt-import-js.'` |

**错误码映射**:

**代码位置**: `source/engine/import/importer.js:238-242`

```javascript
onError : () => {
    let error = new ImportError (ImportErrorCode.ImportFailed);
    error.mainFile = mainFile.file.name;
    error.message = importer.GetErrorMessage ();
    callbacks.onImportError (error);
}
```

| 项目 | 现状值 |
|------|--------|
| `ImportError.code` | `ImportErrorCode.ImportFailed` (值: 3) |
| `ImportError.mainFile` | 主文件名 |
| `ImportError.message` | 本地化的错误消息 |

**可验证判据**:
```javascript
// 验证方式
importer.WasError() === true;
importer.GetErrorMessage() !== null;
```

#### 资源回收时点

**ClearContent() 实现**:

| 导入器 | ClearContent() 行为 |
|--------|---------------------|
| `Importer3dm` | `this.instanceIdToObject = null; this.instanceIdToDefinition = null;` |
| `ImporterIfc` | `this.expressIDToMesh = null; this.colorToMaterial = null;` |
| `ImporterOcct` | `if (this.worker !== null) { this.worker.terminate(); this.worker = null; }` |
| `ImporterFcstd` | `if (this.worker !== null) { this.worker.terminate(); this.worker = null; } this.document = null;` |

**关键发现 ⚠️**:

| 资源类型 | 回收情况 | 说明 |
|---------|---------|------|
| **WASM 单例实例** | ❌ **不回收** | `this.rhino`, `this.ifc`, `this.draco` 保持不变 |
| **Worker 实例** | ✅ 回收 | `worker.terminate()` 被调用 |
| **Worker 事件监听器** | ⚠️ **部分问题** | `addEventListener` 但没有 `removeEventListener` |
| **临时状态 Map** | ✅ 回收 | `instanceIdToObject` 等置 `null` |
| **Model 对象** | ✅ 回收 | `importer.Clear()` 中置 `null` |
| **回调引用** | ✅ 回收 | `importer.Clear()` 中置 `null` |

**全局资源**:

| 资源 | 回收情况 | 说明 |
|------|---------|------|
| `loadedExternalLibUrls` Set | ⚠️ 不回收 | 脚本加载**成功**时才添加，失败时不添加（这是正确的，允许重试） |
| `occtWorkerUrl` Blob URL | ❌ **不回收** | `URL.createObjectURL()` 创建，但没有 `URL.revokeObjectURL()` |
| 动态 `<script>` 标签 | ⚠️ 不回收 | `document.head.appendChild()` 但没有 `removeChild()` |

#### 收敛判据

**可验证的收敛标志**:

| 判据 | 验证方式 | 现状结果 |
|------|---------|---------|
| `onError` 回调触发 | 回调函数被调用 | ✅ |
| `onComplete` 回调触发 | 回调函数被调用 | ✅ |
| `importer.Clear()` 执行 | 方法被调用 | ✅ |
| `this.error === true` | 错误标志设置 | ✅ |
| `this.callbacks === null` | 回调引用清空 | ✅ (在 Clear() 中) |
| 新 Import() 可正常开始 | 状态可重置 | ✅ |

### 1.2 改进建议

| 优先级 | 建议项 | 理由 |
|--------|--------|------|
| 🟡 中 | Worker 事件监听器 `removeEventListener` | 可能导致内存泄漏，特别是多次导入时 |
| 🟢 低 | `occtWorkerUrl` 增加 `Dispose()` 方法 | 长期运行时可能积累 Blob URL |
| 🟢 低 | 动态 `<script>` 标签可选移除 | 通常不是问题，但长期运行可考虑 |

---

## 场景 2: 初始化失败 (Init Failed)

### 2.1 现状事实

#### 触发条件

**WASM 实例化函数**:

| 库 | 实例化调用 | 代码位置 |
|----|-----------|---------|
| rhino3dm | `rhino3dm()` | `importer3dm.js:52` |
| web-ifc | `this.ifc.Init()` | `importerifc.js:48` |
| draco3d | `DracoDecoderModule()` | `importergltf.js:286` |

**具体触发场景**:
- WASM 编译失败（浏览器不兼容、内存不足）
- WASM 实例化失败（导入表解析失败等）
- `Init()` 内部错误（web-ifc 特定）

#### 关键问题: Promise 链断裂

**代码位置**: `source/engine/import/importer3dm.js:48-65`

```javascript
ImportContent (fileContent, onFinish)
{
    if (this.rhino === null) {
        LoadExternalLibrary ('rhino3dm').then (() => {
            rhino3dm ().then ((rhino) => {  // ⚠️ 这个 Promise 没有被 return
                this.rhino = rhino;
                this.ImportRhinoContent (fileContent);
                onFinish ();
            });
            // ⚠️ 没有 .catch()！
        }).catch (() => {
            // ⚠️ 这个 .catch() 只能捕获 LoadExternalLibrary 的失败
            // ⚠️ 不能捕获 rhino3dm() 的失败！
            this.SetError (Loc ('Failed to load rhino3dm.'));
            onFinish ();
        });
    }
    // ...
}
```

**Promise 链可视化**:

```
LoadExternalLibraryPromise
    │
    ├── .then() → 返回 undefined (不是内部 Promise)
    │               │
    │               └── rhino3dmPromise
    │                       │
    │                       ├── .then() → 成功时调用 onFinish()
    │                       │
    │                       └── ❌ 无 .catch() → 失败时悬挂
    │
    └── .catch() → 仅捕获 LoadExternalLibrary 的失败
```

#### 状态收敛结果

| 检查项 | 现状值 |
|--------|--------|
| `onFinish()` 调用 | ❌ **永不调用** |
| `CreateResult()` 调用 | ❌ **永不调用** |
| `onError` 回调 | ❌ **永不触发** |
| `onComplete` 回调 | ❌ **永不触发** |
| `importer.Clear()` | ❌ **永不调用** (除非新 Import() 触发) |

**收敛结果**: ❌ **悬挂**

**悬挂场景演示**:

```
时序:
t0: Import('test.3dm') 开始
    └── this.error = false
    └── LoadExternalLibrary('rhino3dm') 发起

t1: 脚本加载成功
    └── 进入第一个 .then()
    └── 调用 rhino3dm() 开始 WASM 实例化

t2: WASM 实例化失败 (内存不足)
    └── rhino3dm() 返回的 Promise 被 reject
    └── ❌ 没有 .catch() 处理这个 reject
    └── ❌ onFinish() 永不调用

结果:
- this.error 保持 false
- 所有回调都不触发
- 导入操作"悬挂"
- 用户看到的进度条永远停在"正在加载..."
```

#### 错误回传口径

| 项目 | 现状值 |
|------|--------|
| `this.error` | **保持 `false`** |
| `this.message` | **保持 `null`** |
| `ImportError` 对象 | **永不创建** |
| 错误码 | **无** |
| 控制台输出 | **无** (静默吞掉) |

**可验证判据**: 无可用判据，操作悬挂。

#### 资源回收时点

| 资源类型 | 回收情况 |
|---------|---------|
| **WASM 部分实例** | ❌ 可能泄漏（如果初始化中途失败） |
| **Worker 实例** | ⚠️ 依赖新 Import() 触发 Clear() |
| **临时状态** | ⚠️ 依赖新 Import() 触发 Clear() |
| **回调引用** | ⚠️ 依赖新 Import() 触发 Clear() |

**唯一的"回收"方式**: 用户开始新的导入，触发 `Import()` → `Clear()`。

#### 收敛判据

**无有效收敛判据**，操作处于悬挂状态。

**可观察现象**:
- UI 显示"正在加载..."或"正在导入..."
- 无法通过编程方式检测（所有状态保持不变）
- 只能通过超时或用户操作间接推断

### 2.2 改进建议

| 优先级 | 建议项 | 代码位置 |
|--------|--------|---------|
| 🔴 高 | **正确 return 内部 Promise** | `importer3dm.js:51-56`, `importerifc.js:46-51`, `importergltf.js:285-289` |
| 🔴 高 | **为每个 .then() 添加对应的 .catch()** | 同上 |
| 🟡 中 | **统一的错误处理函数** | 提取 `HandleInitError()` 方法 |

**修复示例 (Importer3dm)**:

```javascript
// 修复前
LoadExternalLibrary ('rhino3dm').then (() => {
    rhino3dm ().then ((rhino) => {
        // ...
    });
    // 没有 return，没有 .catch()
}).catch (() => {
    // 只能捕获 LoadExternalLibrary
});

// 修复后 - 方案 A: 正确 return
LoadExternalLibrary ('rhino3dm')
    .then (() => {
        return rhino3dm ();  // ⚠️ 关键：return 内部 Promise
    })
    .then ((rhino) => {
        this.rhino = rhino;
        this.ImportRhinoContent (fileContent);
        onFinish ();
    })
    .catch (() => {
        // 现在能捕获所有错误了
        this.SetError (Loc ('Failed to load rhino3dm.'));
        onFinish ();
    });

// 修复后 - 方案 B: 每个 .then() 都有 .catch()
LoadExternalLibrary ('rhino3dm').then (() => {
    rhino3dm ().then ((rhino) => {
        this.rhino = rhino;
        this.ImportRhinoContent (fileContent);
        onFinish ();
    }).catch (() => {
        // 捕获 rhino3dm() 的失败
        this.SetError (Loc ('Failed to initialize rhino3dm WebAssembly.'));
        onFinish ();
    });
}).catch (() => {
    // 捕获 LoadExternalLibrary 的失败
    this.SetError (Loc ('Failed to load rhino3dm.'));
    onFinish ();
});
```

---

## 场景 3: Worker 异常 (Worker Error)

### 3.1 现状事实

本场景涉及两个 Worker 导入器：
- `ImporterOcct`: 单对象处理（STEP/IGES/BRep）
- `ImporterFcstd`: 多对象循环处理（FreeCAD，内含多个 BRep）

#### 触发条件

**Worker error 事件监听**:

| 导入器 | 代码位置 |
|--------|---------|
| `ImporterOcct` | `importerocct.js:48-51` |
| `ImporterFcstd` | `importerfcstd.js:352-354` |

**具体触发场景**:
- Worker 内部 JavaScript 运行时错误
- WASM 运行时崩溃
- 内存访问违规
- 死循环导致的超时（需额外检测）

---

### 3.1.1 ImporterOcct (单对象处理)

#### 状态收敛结果

**代码位置**: `source/engine/import/importerocct.js:41-85`

```javascript
ImportContent (fileContent, onFinish)
{
    CreateOcctWorker ().then ((worker) => {
        this.worker = worker;
        this.worker.addEventListener ('message', (ev) => {
            this.ImportResultJson (ev.data, onFinish);
        });
        this.worker.addEventListener ('error', (ev) => {
            this.SetError (Loc ('Failed to load occt-import-js.'));  // ✅ 标记错误
            onFinish ();  // ✅ 调用 onFinish
        });
        // ...
        this.worker.postMessage ({...});
    }).catch (() => {
        this.SetError (Loc ('Failed to load occt-import-js.'));
        onFinish ();
    });
}
```

**收敛路径**:

```
worker.addEventListener('error', ...)
    │
    ├── SetError('Failed to load occt-import-js.')  ✅
    │
    ├── onFinish()  ✅
    │
    └── CreateResult()
            │
            ├── onError()  ✅
            │
            └── onComplete()  ✅
                    │
                    └── importer.Clear()
                            │
                            └── ClearContent()
                                    │
                                    └── worker.terminate()  ✅
```

| 检查项 | 现状值 |
|--------|--------|
| `SetError()` 调用 | ✅ 是 |
| `onFinish()` 调用 | ✅ 是 |
| `onError` 回调 | ✅ 触发 |
| `onComplete` 回调 | ✅ 触发 |
| `importer.Clear()` | ✅ 调用 |

**收敛结果**: ✅ 正常收敛

#### 错误回传口径

| 项目 | 现状值 |
|------|--------|
| 错误消息 | `'Failed to load occt-import-js.'` |
| 错误码 | `ImportErrorCode.ImportFailed` (3) |
| `this.error` | `true` |

**问题 ⚠️**: 错误消息不够精确，"Failed to load" 可能误导（实际是运行时错误，不是加载错误）。

#### 资源回收时点

| 资源类型 | 回收情况 | 说明 |
|---------|---------|------|
| **Worker 实例** | ✅ 回收 | `ClearContent()` 中 `worker.terminate()` |
| **Worker 事件监听器** | ❌ **不回收** | `addEventListener` 但没有 `removeEventListener` |
| **临时状态** | ✅ 回收 | `ClearContent()` 中置 `null` |

**问题 ⚠️**: 虽然 `worker.terminate()` 会隐式移除监听器，但显式 `removeEventListener` 是更好的实践，特别是在监听器引用了 `this` 的情况下。

#### 收敛判据

| 判据 | 验证方式 |
|------|---------|
| `onError` 回调触发 | 回调函数被调用 |
| `onComplete` 回调触发 | 回调函数被调用 |
| `importer.Clear()` 执行 | 方法被调用 |
| `this.worker === null` | Worker 引用清空 (在 ClearContent() 后) |

---

### 3.1.2 ImporterFcstd (多对象循环处理)

#### 关键代码分析

**代码位置**: `source/engine/import/importerfcstd.js:344-384`

```javascript
ConvertObjects (objects, onFinish)
{
    CreateOcctWorker ().then ((worker) => {
        this.worker = worker;

        this.worker.addEventListener ('message', (ev) => {
            onFileConverted (ev.data);
        });

        this.worker.addEventListener ('error', (ev) => {
            onFileConverted (null);  // ⚠️ 注意：传入 null
        });

        let convertedObjectCount = 0;
        let onFileConverted = (resultContent) => {
            if (resultContent !== null) {
                let currentObject = objects[convertedObjectCount];
                this.OnFileConverted (currentObject, resultContent, colorToMaterial);
            }
            // ⚠️ 注意：即使 resultContent 为 null，也继续
            convertedObjectCount += 1;
            if (convertedObjectCount === objects.length) {
                onFinish ();
            } else {
                // ⚠️ 关键问题：继续向已崩溃的 Worker 发送消息！
                let currentObject = objects[convertedObjectCount];
                this.worker.postMessage ({
                    format : 'brep',
                    buffer : currentObject.fileContent
                });
            }
        };

        // 开始处理第一个对象
        let currentObject = objects[convertedObjectCount];
        this.worker.postMessage ({
            format : 'brep',
            buffer : currentObject.fileContent
        });
    }).catch (() => {
        this.SetError (Loc ('Failed to load occt-import-js.'));
        onFinish ();
    });
}
```

#### 问题清单

| 问题 | 代码位置 | 影响 |
|------|---------|------|
| **没有 `SetError()` 调用** | `importerfcstd.js:353` | `this.error` 保持 `false` |
| **继续发送消息** | `importerfcstd.js:367-371` | 发送到已崩溃的 Worker |
| **没有终止循环** | 同上 | 永远等待已死亡 Worker 的响应 |

#### 状态收敛结果

**悬挂场景演示**:

```
假设 objects 有 5 个对象待处理，第 3 个对象导致 Worker 崩溃

时序:
t0: 发送对象 0 → Worker
t1: 收到对象 0 结果 → convertedObjectCount = 1
t2: 发送对象 1 → Worker
t3: 收到对象 1 结果 → convertedObjectCount = 2
t4: 发送对象 2 → Worker
t5: Worker 处理对象 2 时崩溃
    └── worker.addEventListener('error') 触发
    └── onFileConverted(null) 被调用
    └── ❌ 没有 SetError()
    └── convertedObjectCount = 3
    └── 检查：3 !== 5，继续
    └── ❌ 发送对象 3 → 已崩溃的 Worker！
    └── 对象 3 的消息永远没有回应
    └── ❌ onFinish() 永远不会调用

结果:
- this.error 保持 false
- 循环"卡"在 convertedObjectCount = 3
- 永远等待对象 3 的结果
- 导入悬挂
```

| 检查项 | 现状值 |
|--------|--------|
| `SetError()` 调用 | ❌ **否** |
| `this.error` | **保持 `false`** |
| `onFinish()` 调用 | ❌ **永不调用** |
| `onError` 回调 | ❌ **永不触发** |
| `onComplete` 回调 | ❌ **永不触发** |
| 消息继续发送 | ✅ **是** (发送到已崩溃的 Worker) |

**收敛结果**: ❌ **悬挂**

#### 错误回传口径

| 项目 | 现状值 |
|------|--------|
| `this.error` | **保持 `false`** |
| 错误消息 | **无** |
| `ImportError` | **永不创建** |

#### 资源回收时点

| 资源类型 | 回收情况 |
|---------|---------|
| **Worker 实例** | ❌ **不回收** (除非新 Import() 触发 Clear()) |
| **Worker 事件监听器** | ❌ **不回收** |
| **临时状态** | ❌ **不回收** (除非新 Import() 触发 Clear()) |
| **Document 对象** | ❌ **不回收** (除非新 Import() 触发 Clear()) |

#### 收敛判据

**无有效收敛判据**，操作处于悬挂状态。

**特殊情况**: 如果恰好是最后一个对象导致崩溃，`convertedObjectCount === objects.length` 会满足，`onFinish()` 会被调用。但：
- `this.error` 仍然是 `false`
- 可能报告"成功"但实际是部分结果

---

### 3.2 改进建议

| 优先级 | 建议项 | 适用导入器 |
|--------|--------|-----------|
| 🔴 高 | **ImporterFcstd 的 error 处理调用 `SetError()`** | `importerfcstd.js:352-354` |
| 🔴 高 | **ImporterFcstd 错误时终止循环，不继续发送消息** | `importerfcstd.js:358-373` |
| 🟡 中 | **错误消息区分"加载失败"和"运行时错误"** | `importerocct.js:49`, `importerfcstd.js:381` |
| 🟡 中 | **显式 `removeEventListener`** | 两个导入器 |
| 🟢 低 | **添加超时检测** | 处理可能的死循环 |

**修复示例 (ImporterFcstd)**:

```javascript
// 修复前
this.worker.addEventListener ('error', (ev) => {
    onFileConverted (null);
});

// 修复后
this.worker.addEventListener ('error', (ev) => {
    // 1. 标记错误
    this.SetError (Loc ('Worker error during FreeCAD object processing.'));
    
    // 2. 终止 Worker
    if (this.worker !== null) {
        this.worker.removeEventListener ('message', onFileConverted);
        this.worker.removeEventListener ('error', onWorkerError);
        this.worker.terminate ();
        this.worker = null;
    }
    
    // 3. 触发完成回调
    onFinish ();
});
```

---

## 场景 4: 用户取消 (User Cancel)

### 4.1 现状事实

#### 触发条件

**唯一的"取消"点**: 多文件选择时用户"取消"选择

**代码位置**: `source/engine/import/importer.js:170-186`

```javascript
ImportLoadedFiles (settings, callbacks)
{
    let importableFiles = this.GetImportableFiles (this.fileList);
    // ...

    if (importableFiles.length === 1 || !callbacks.onSelectMainFile) {
        // 单文件：直接导入
        let mainFile = importableFiles[0];
        this.ImportLoadedMainFile (mainFile, settings, callbacks);
    } else {
        // 多文件：让用户选择主文件
        let fileNames = importableFiles.map (importableFile => importableFile.file.name);
        callbacks.onSelectMainFile (fileNames, (mainFileIndex) => {
            if (mainFileIndex === null) {
                // ⚠️ 用户"取消"选择
                callbacks.onImportError (new ImportError (ImportErrorCode.NoImportableFile));
                return;  // ⚠️ 直接 return，没有清理！
            }
            // ...
        });
    }
}
```

**其他"取消"方式**:

| 方式 | 支持情况 | 说明 |
|------|---------|------|
| **显式 Cancel() API** | ❌ **不存在** | 没有 `Cancel()` 方法 |
| **重叠导入** | ⚠️ 部分支持 | 新 `Import()` 触发 `Clear()`，但旧回调可能污染新状态 |
| **页面刷新/关闭** | ✅ 支持 | 浏览器行为 |

#### 状态收敛结果

**多文件选择取消的路径**:

```
callbacks.onSelectMainFile(fileNames, (mainFileIndex) => {
    if (mainFileIndex === null) {
        // 用户"取消"
        callbacks.onImportError(new ImportError(ImportErrorCode.NoImportableFile));
        return;  // 直接返回
    }
});
```

| 检查项 | 现状值 |
|--------|--------|
| `onImportError` 调用 | ✅ 是 |
| `ImportError.code` | `ImportErrorCode.NoImportableFile` (值: 1) |
| `onComplete` 调用 | ❌ **否** |
| `importer.Clear()` 调用 | ❌ **否** |
| `this.error` | ⚠️ 取决于上层实现 |

**关键问题分析**:

```
对比正常导入完成路径：

正常成功/失败路径:
importer.Import(..., {
    onSuccess: () => { ... },
    onError: () => { ... },
    onComplete: () => {
        importer.Clear();  // ✅ 总是调用
    }
});

多文件选择"取消"路径:
callbacks.onSelectMainFile(fileNames, (mainFileIndex) => {
    if (mainFileIndex === null) {
        callbacks.onImportError(new ImportError(...));
        return;  // ❌ 没有调用 onComplete
                  // ❌ 没有调用 importer.Clear()
    }
});
```

**收敛结果**: ⚠️ **部分收敛**

- ✅ 错误回调触发
- ❌ 清理不完整

#### 错误回传口径

| 项目 | 现状值 |
|------|--------|
| `ImportError.code` | `ImportErrorCode.NoImportableFile` (值: 1) |
| `ImportError.mainFile` | `null` |
| `ImportError.message` | `null` |

**问题 ⚠️**: 使用 `NoImportableFile` 错误码语义不准确。用户取消选择和"没有可导入文件"是不同的场景。

#### 资源回收时点

| 资源类型 | 回收情况 | 说明 |
|---------|---------|------|
| **Importer 状态** | ❌ **不回收** | 除非新 Import() 触发 |
| **fileList** | ❌ **不回收** | 保持上次的文件列表 |
| **回调引用** | ❌ **不回收** | 保持上次的回调 |

**唯一的回收方式**: 用户开始新的导入操作。

#### 收敛判据

| 判据 | 验证方式 | 现状结果 |
|------|---------|---------|
| `onImportError` 回调触发 | 回调函数被调用 | ✅ |
| `onComplete` 回调触发 | 回调函数被调用 | ❌ |
| `importer.Clear()` 执行 | 方法被调用 | ❌ |
| 新 Import() 可正常开始 | 状态可重置 | ⚠️ 依赖新 Import() 自身触发 Clear() |

---

### 4.2 其他"取消"场景分析

#### 重叠导入 (Import 过程中开始新 Import)

**代码位置**: `source/engine/import/importerbase.js:19-33`

```javascript
Import (name, extension, content, callbacks)
{
    this.Clear ();  // ⚠️ 第一步：清理

    this.name = name;
    this.extension = extension;
    this.callbacks = callbacks;  // ⚠️ 替换为新的 callbacks
    // ...
}
```

**问题**: `Clear()` 只是清空 `this.callbacks` 等引用，但**旧的异步回调仍然可能执行**。

**竞态场景**:

```
时序:
t0: Import('large.3dm') 开始
    └── this.callbacks = callbacks_A
    └── LoadExternalLibrary('rhino3dm') 发起

t1: 用户不耐烦，选择 'simple.stl'
    └── Import('simple.stl') 开始
    └── this.Clear() 被调用
            │
            ├── this.name = null
            ├── this.callbacks = null  ⚠️ 旧的 callbacks_A 引用被清空
            └── ClearContent() 被调用

    └── this.callbacks = callbacks_B  (新的回调)
    └── 开始解析 stl (不需要 WASM，很快)

t2: stl 解析完成
    └── callbacks_B.onSuccess() 被调用
    └── 用户看到模型

t3: 此时 rhino3dm 脚本加载完成
    └── 旧的 .then() 回调执行
    └── 捕获的是旧的变量闭包
    └── 可能执行：
            - rhino3dm() 实例化
            - this.rhino = rhino  (污染新状态)
            - 尝试调用旧的 onFinish()
            - 但 this.callbacks 现在是 callbacks_B 或 null
```

**竞态风险**:

| 风险项 | 说明 |
|--------|------|
| **WASM 单例污染** | 旧导入的 `this.rhino = rhino` 可能覆盖新导入的状态 |
| **回调混淆** | 旧的 onFinish 可能使用新的 `this.callbacks` |
| **模型数据污染** | 旧的 `ImportRhinoContent()` 可能写入新的 `this.model` |

#### 显式 Cancel API

**现状**: ❌ **不存在**

没有 `Cancel()` 方法，没有 `onCancel` 回调。

---

### 4.3 改进建议

| 优先级 | 建议项 | 代码位置 |
|--------|--------|---------|
| 🟡 中 | **多文件选择取消时调用 `onComplete` 或等价清理** | `importer.js:175-178` |
| 🟡 中 | **添加 `UserCancelled` 错误码** | 区分"用户取消"和"无文件" |
| 🟡 中 | **添加世代计数器保护** | 防止旧回调污染新状态 |
| 🟢 低 | **添加显式 `Cancel()` API** | 提供编程取消能力 |
| 🟢 低 | **添加 `onCancel` 回调** | 区分取消和错误 |

**修复示例 (多文件选择取消)**:

```javascript
// 修复前
callbacks.onSelectMainFile (fileNames, (mainFileIndex) => {
    if (mainFileIndex === null) {
        callbacks.onImportError (new ImportError (ImportErrorCode.NoImportableFile));
        return;
    }
    // ...
});

// 修复后
callbacks.onSelectMainFile (fileNames, (mainFileIndex) => {
    if (mainFileIndex === null) {
        // 选项 A: 使用新的错误码
        let error = new ImportError (ImportErrorCode.UserCancelled);
        callbacks.onImportError (error);
        
        // 选项 B: 添加 onCancel 回调（如果有）
        if (callbacks.onCancel) {
            callbacks.onCancel ();
        }
        
        // ✅ 关键：触发清理
        if (callbacks.onComplete) {
            callbacks.onComplete ();
        }
        return;
    }
    // ...
});
```

---

## 汇总对比表

### 现状收敛情况

| 场景 | 收敛结果 | 主要问题 |
|------|---------|---------|
| **场景 1: 加载失败** | ✅ 正常收敛 | 资源回收不完全（事件监听器、全局 Blob URL） |
| **场景 2: 初始化失败** | ❌ **悬挂** | Promise 链断裂，错误被静默吞掉 |
| **场景 3: Worker 异常 (ImporterOcct)** | ✅ 正常收敛 | 事件监听器不移除，错误消息不准确 |
| **场景 3: Worker 异常 (ImporterFcstd)** | ❌ **悬挂** | 继续向崩溃的 Worker 发消息，无 `SetError()` |
| **场景 4: 用户取消 (多文件选择)** | ⚠️ 部分收敛 | 无 `onComplete`，无 `Clear()`，错误码语义不准 |
| **场景 4: 重叠导入竞态** | ⚠️ 风险 | 无世代保护，旧回调可能污染新状态 |

### 错误回传口径

| 场景 | `this.error` | 错误码 | 错误消息 |
|------|-------------|--------|---------|
| 加载失败 | `true` | `ImportFailed` (3) | 本地化消息（如 `'Failed to load rhino3dm.'`） |
| 初始化失败 | **保持 `false`** | **无** | **无** |
| Worker 异常 (Occt) | `true` | `ImportFailed` (3) | `'Failed to load occt-import-js.'` |
| Worker 异常 (Fcstd) | **保持 `false`** | **无** | **无** |
| 用户取消 | 取决于上层 | `NoImportableFile` (1) | `null` |

### 资源回收情况

| 资源类型 | 加载失败 | 初始化失败 | Worker 异常 | 用户取消 |
|---------|---------|-----------|------------|---------|
| **WASM 单例** | ❌ 不回收 | ❌ 可能泄漏 | ❌ 不回收 | ❌ 不回收 |
| **Worker 实例** | ✅ 回收 | ⚠️ 依赖新 Import | ✅ 回收 (Occt) / ❌ 悬挂 (Fcstd) | ❌ 不回收 |
| **事件监听器** | ❌ 不移除 | ❌ 不移除 | ❌ 不移除 | ❌ 不移除 |
| **Model 对象** | ✅ 回收 | ⚠️ 依赖新 Import | ✅ 回收 (Occt) / ❌ 悬挂 (Fcstd) | ❌ 不回收 |
| **回调引用** | ✅ 回收 | ⚠️ 依赖新 Import | ✅ 回收 (Occt) / ❌ 悬挂 (Fcstd) | ❌ 不回收 |
| **全局 Blob URL** | ❌ 不回收 | ❌ 不回收 | ❌ 不回收 | ❌ 不回收 |

### 收敛判据可用性

| 场景 | 判据可用性 | 可验证的收敛标志 |
|------|-----------|-----------------|
| 加载失败 | ✅ 可用 | `onError`, `onComplete`, `Clear()` |
| 初始化失败 | ❌ **不可用** | 无，操作悬挂 |
| Worker 异常 (Occt) | ✅ 可用 | `onError`, `onComplete`, `Clear()` |
| Worker 异常 (Fcstd) | ❌ **不可用** | 无，操作悬挂 |
| 用户取消 | ⚠️ 部分可用 | `onImportError`，但无 `onComplete` / `Clear()` |

---

## 关键发现总结

### 高优先级问题 (🔴)

| # | 问题 | 影响范围 | 根因 |
|---|------|---------|------|
| 1 | **Promise 链断裂导致初始化失败悬挂** | `Importer3dm`, `ImporterIfc`, `ImporterGltf` (Draco) | 内部 Promise 没有被 return，也没有 `.catch()` |
| 2 | **ImporterFcstd Worker 异常悬挂** | `ImporterFcstd` (FreeCAD) | 无 `SetError()`，继续向崩溃的 Worker 发消息 |

### 中优先级问题 (🟡)

| # | 问题 | 影响范围 |
|---|------|---------|
| 3 | **Worker 事件监听器不移除** | 所有 Worker 导入器 |
| 4 | **多文件选择取消缺少清理** | 多文件选择场景 |
| 5 | **错误消息/错误码语义不准确** | 多处 |
| 6 | **无世代保护导致竞态风险** | 所有异步导入器 |

### 低优先级问题 (🟢)

| # | 问题 | 说明 |
|---|------|------|
| 7 | **全局 Blob URL 不回收** | 长期运行可能积累，但影响小 |
| 8 | **无显式 Cancel() API** | 缺少编程取消能力 |
| 9 | **动态 script 标签不移除** | 通常不是问题 |

---

## 附录: 代码位置索引

| 功能 | 文件路径 | 行号 |
|------|---------|------|
| 脚本加载失败 reject | `source/engine/io/externallibs.js` | 18-20 |
| Importer3dm 加载失败处理 | `source/engine/import/importer3dm.js` | 57-60 |
| Importer3dm Promise 链问题 | `source/engine/import/importer3dm.js` | 48-65 |
| ImporterIfc Promise 链问题 | `source/engine/import/importerifc.js` | 43-60 |
| ImporterOcct Worker error 处理 | `source/engine/import/importerocct.js` | 48-51 |
| ImporterFcstd Worker error 问题 | `source/engine/import/importerfcstd.js` | 352-373 |
| 多文件选择取消处理 | `source/engine/import/importer.js` | 170-186 |
| CreateResult 回调触发 | `source/engine/import/importerbase.js` | 46-68 |
| Import() 开始时 Clear | `source/engine/import/importerbase.js` | 19-33 |
