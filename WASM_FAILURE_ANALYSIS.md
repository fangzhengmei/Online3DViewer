# Online3DViewer WebAssembly 失败与中断场景分析报告

> 本文档是 [WASM_INTEGRATION_ANALYSIS.md](./WASM_INTEGRATION_ANALYSIS.md) 的补充，重点分析失败与中断场景下的协作机制。

---

## 1. 错误处理架构概览

### 1.1 回调契约设计

所有导入操作遵循统一的 **三回调契约**，确保无论成功或失败，状态都能正确收敛：

**基类实现** ([source/engine/import/importerbase.js:46-68](source/engine/import/importerbase.js)):

```javascript
CreateResult (callbacks)
{
    if (this.error) {
        callbacks.onError ();
        callbacks.onComplete ();  // 关键：总是调用
        return;
    }

    if (IsModelEmpty (this.model)) {
        this.SetError (Loc ('The model doesn\'t contain any meshes.'));
        callbacks.onError ();
        callbacks.onComplete ();  // 关键：总是调用
        return;
    }

    // ... 成功处理

    callbacks.onSuccess ();
    callbacks.onComplete ();  // 关键：总是调用
}
```

**调用层的资源清理保证** ([source/engine/import/importer.js:244-246](source/engine/import/importer.js)):

```javascript
onComplete : () => {
    importer.Clear ();  // 无论成功失败，最终都会清理
}
```

### 1.2 错误码体系

| 错误码 | 常量名 | 触发场景 |
|--------|--------|----------|
| `1` | `NoImportableFile` | 文件列表中没有可识别的导入格式 |
| `2` | `FailedToLoadFile` | 文件加载失败（网络/文件读取错误） |
| `3` | `ImportFailed` | 解析/导入过程中失败（WASM 相关错误） |
| `4` | `UnknownError` | 未知错误 |

**定义位置** ([source/engine/import/importer.js:29-35](source/engine/import/importer.js)):

```javascript
export const ImportErrorCode =
{
    NoImportableFile : 1,
    FailedToLoadFile : 2,
    ImportFailed : 3,
    UnknownError : 4
};
```

---

## 2. 加载失败场景分析

### 2.1 外部库脚本加载失败

**底层加载器实现** ([source/engine/io/externallibs.js:1-23](source/engine/io/externallibs.js)):

```javascript
let loadedExternalLibUrls = new Set ();

export function LoadExternalLibraryFromUrl (libraryUrl)
{
    return new Promise ((resolve, reject) => {
        if (loadedExternalLibUrls.has (libraryUrl)) {
            resolve ();
            return;
        }

        let scriptElement = document.createElement ('script');
        scriptElement.type = 'text/javascript';
        scriptElement.src = libraryUrl;
        scriptElement.onload = () => {
            loadedExternalLibUrls.add (libraryUrl);
            resolve ();
        };
        scriptElement.onerror = () => {
            reject ();  // 网络错误、404 等
        };
        document.head.appendChild (scriptElement);
    });
}
```

**失败传播路径** (以 `Importer3dm` 为例, [source/engine/import/importer3dm.js:48-65](source/engine/import/importer3dm.js)):

```javascript
ImportContent (fileContent, onFinish)
{
    if (this.rhino === null) {
        LoadExternalLibrary ('rhino3dm').then (() => {
            rhino3dm ().then ((rhino) => {
                this.rhino = rhino;
                this.ImportRhinoContent (fileContent);
                onFinish ();
            });
        }).catch (() => {
            // 脚本加载失败时进入这里
            this.SetError (Loc ('Failed to load rhino3dm.'));
            onFinish ();
        });
    }
    // ...
}
```

### 2.2 文件加载失败

**网络请求失败** ([source/engine/io/fileutils.js:52-77](source/engine/io/fileutils.js)):

```javascript
export function RequestUrl (url, onProgress)
{
    return new Promise ((resolve, reject) => {
        let request = new XMLHttpRequest ();
        // ...
        request.onload = () => {
            if (request.status === 200) {
                resolve (request.response);
            } else {
                reject ();  // HTTP 错误状态码
            }
        };
        request.onerror = () => {
            reject ();  // 网络层面错误
        };
        // ...
    });
}
```

**本地文件读取失败** ([source/engine/io/fileutils.js:79-100](source/engine/io/fileutils.js)):

```javascript
export function ReadFile (file, onProgress)
{
    return new Promise ((resolve, reject) => {
        let reader = new FileReader ();
        // ...
        reader.onerror = () => {
            reject ();
        };
        reader.readAsArrayBuffer (file);
    });
}
```

### 2.3 加载失败的状态收敛

| 组件 | 失败时的操作 | 状态保证 |
|------|-------------|----------|
| `LoadExternalLibraryFromUrl` | `reject()` | Promise 拒绝，不修改 `loadedExternalLibUrls` |
| `LoadExternalLibrary` | 透传 `reject` | 调用层通过 `.catch()` 处理 |
| 各 `Importer` | `SetError()` + `onFinish()` | `this.error = true`，等待 `CreateResult` 处理 |
| `CreateResult` | `onError()` + `onComplete()` | 错误回调触发，资源清理触发 |
| `onComplete` | `importer.Clear()` | 导入器状态重置 |

**关键点**: `loadedExternalLibUrls` 只在 `onload` 成功时才添加，失败时不会标记为已加载，下次可以重试。

---

## 3. 初始化失败场景分析

### 3.1 两层 Promise 链式初始化

大多数 WASM 库采用 **脚本加载 + WASM 实例化** 两层 Promise 模式：

**rhino3dm 初始化流程** ([source/engine/import/importer3dm.js:48-65](source/engine/import/importer3dm.js)):

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ 第一层 Promise  │     │ 第二层 Promise  │     │   实际解析      │
│ LoadExternalLib │────▶│   rhino3dm()    │────▶│ ImportRhinoContent │
│  (脚本加载)      │     │  (WASM 实例化)   │     │                 │
└────────┬────────┘     └────────┬────────┘     └─────────────────┘
         │                       │
         ▼                       ▼
    .catch() 捕获           .catch() 未显式处理
    网络错误、404          但会被外层 .catch() 捕获
    设置错误消息             (Promise 链式传播)
```

**代码中的隐式依赖**:

```javascript
LoadExternalLibrary ('rhino3dm').then (() => {
    // 这里假设脚本加载成功后，全局 rhino3dm 函数可用
    rhino3dm ().then ((rhino) => {
        // ...
    });
    // ⚠️ 注意：内层 .then() 没有对应的 .catch()
    // 如果 rhino3dm() 实例化失败，会发生什么？
}).catch (() => {
    // 这个 .catch() 能捕获内层的错误吗？
    // 答案：不能！因为内层 Promise 没有被 return
    this.SetError (Loc ('Failed to load rhino3dm.'));
    onFinish ();
});
```

### 3.2 web-ifc 的显式 Init 调用

**web-ifc 初始化** ([source/engine/import/importerifc.js:43-60](source/engine/import/importerifc.js)):

```javascript
ImportContent (fileContent, onFinish)
{
    if (this.ifc === null) {
        LoadExternalLibrary ('webifc').then (() => {
            this.ifc = new WebIFC.IfcAPI ();
            this.ifc.Init ().then (() => {
                this.ImportIfcContent (fileContent);
                onFinish ();
            });
            // ⚠️ 同样：Init() 的 .then() 没有 .catch()
        }).catch (() => {
            this.SetError (Loc ('Failed to load web-ifc.'));
            onFinish ();
        });
    }
    // ...
}
```

### 3.3 初始化失败的悬挂风险分析

#### 风险点 1: 未处理的内层 Promise 拒绝

```
时序图：
t0: LoadExternalLibrary('rhino3dm') 开始
t1: 脚本加载成功，进入第一个 .then()
t2: 调用 rhino3dm() 开始 WASM 实例化
t3: WASM 实例化失败（内存不足、编译错误等）
t4: 内层 Promise 被拒绝，但没有 .catch() 处理

结果：
- onFinish() 永远不会被调用
- this.error 保持为 false
- CreateResult() 不会被触发
- 导入操作"悬挂"
```

#### 风险点 2: 部分初始化状态

| 场景 | `this.rhino` 状态 | 后续导入行为 |
|------|-------------------|-------------|
| 脚本加载成功 + WASM 实例化失败 | `null` | 下次会重新尝试完整初始化 |
| 脚本加载成功 + WASM 实例化成功 + 解析失败 | **已赋值** | 下次复用实例，跳过加载 |

**关键代码** ([source/engine/import/importer3dm.js:48-65](source/engine/import/importer3dm.js)):

```javascript
if (this.rhino === null) {
    // 只有 rhino 为 null 时才走初始化流程
} else {
    // 直接复用
    this.ImportRhinoContent (fileContent);
    onFinish ();
}
```

### 3.4 Draco 解码器的特殊处理

**glTF 中的 Draco 加载** ([source/engine/import/importergltf.js:278-296](source/engine/import/importergltf.js)):

```javascript
LoadLibraries (extensionsRequired, callbacks)
{
    if (this.draco === null && extensionsRequired.indexOf ('KHR_draco_mesh_compression') !== -1) {
        LoadExternalLibrary ('draco3d').then (() => {
            DracoDecoderModule ().then ((draco) => {
                this.draco = draco;
                callbacks.onSuccess ();
            });
        }).catch (() => {
            callbacks.onError (Loc ('Failed to load draco decoder.'));
        });
    } else {
        callbacks.onSuccess ();
    }
}
```

**改进点**: Draco 加载有显式的 `.catch()` 处理，但内层 `DracoDecoderModule().then()` 仍然缺少错误处理。

---

## 4. Worker 异常退出场景分析

### 4.1 ImporterOcct 的 Worker 错误处理

**基础错误监听** ([source/engine/import/importerocct.js:41-85](source/engine/import/importerocct.js)):

```javascript
ImportContent (fileContent, onFinish)
{
    CreateOcctWorker ().then ((worker) => {
        this.worker = worker;
        this.worker.addEventListener ('message', (ev) => {
            this.ImportResultJson (ev.data, onFinish);
        });
        this.worker.addEventListener ('error', (ev) => {
            // Worker 运行时错误
            this.SetError (Loc ('Failed to load occt-import-js.'));
            onFinish ();
        });

        // 发送任务给 Worker
        this.worker.postMessage ({
            format : format,
            buffer : fileBuffer,
            params : params
        });
    }).catch (() => {
        // Worker 创建失败（脚本加载失败等）
        this.SetError (Loc ('Failed to load occt-import-js.'));
        onFinish ();
    });
}
```

### 4.2 ImporterFcstd 的复杂场景

**FreeCAD 格式的特殊挑战**: 一个 `.fcstd` 文件可能包含多个 BRep 对象，需要循环处理。

**代码实现** ([source/engine/import/importerfcstd.js:344-384](source/engine/import/importerfcstd.js)):

```javascript
ConvertObjects (objects, onFinish)
{
    CreateOcctWorker ().then ((worker) => {
        this.worker = worker;
        
        let onFileConverted = (resultContent) => {
            if (resultContent !== null) {
                let currentObject = objects[convertedObjectCount];
                this.OnFileConverted (currentObject, resultContent, colorToMaterial);
            }
            convertedObjectCount += 1;
            if (convertedObjectCount === objects.length) {
                onFinish ();  // 所有对象处理完成
            } else {
                // ⚠️ 继续发送下一个对象到 Worker
                let currentObject = objects[convertedObjectCount];
                this.worker.postMessage ({
                    format : 'brep',
                    buffer : currentObject.fileContent
                });
            }
        };

        this.worker.addEventListener ('message', (ev) => {
            onFileConverted (ev.data);
        });

        this.worker.addEventListener ('error', (ev) => {
            // ⚠️ Worker 出错时，传入 null
            onFileConverted (null);
        });

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

### 4.3 Worker 错误处理的问题分析

#### 问题 1: 失效 Worker 的继续使用

```
场景：10 个对象待处理，第 3 个导致 Worker 崩溃

时序：
t0: 发送对象 0 到 Worker
t1: 收到对象 0 结果，convertedObjectCount = 1
t2: 发送对象 1 到 Worker
t3: 收到对象 1 结果，convertedObjectCount = 2
t4: 发送对象 2 到 Worker
t5: Worker 处理对象 2 时崩溃，触发 error 事件
t6: onFileConverted(null) 被调用
t7: convertedObjectCount = 3
t8: 检查：3 !== 10，继续
t9: 发送对象 3 到 **已崩溃的 Worker** ⚠️

结果：
- 对象 3 的消息发送到已死亡的 Worker
- 没有回应，onFinish() 永远不会调用
- 整个导入悬挂
```

#### 问题 2: 错误静默吞掉

```javascript
this.worker.addEventListener ('error', (ev) => {
    onFileConverted (null);  // 没有 SetError()！
});
```

对比 `ImporterOcct`:

```javascript
this.worker.addEventListener ('error', (ev) => {
    this.SetError (Loc ('Failed to load occt-import-js.'));  // 有错误标记
    onFinish ();
});
```

**差异**: `ImporterFcstd` 的 Worker error 处理没有调用 `SetError()`，意味着：
- `this.error` 保持 `false`
- `CreateResult()` 不会走错误分支
- 但可能因为 `IsModelEmpty()` 而失败

### 4.4 Worker 资源清理

**正常清理** ([source/engine/import/importerocct.js:28-34](source/engine/import/importerocct.js)):

```javascript
ClearContent ()
{
    if (this.worker !== null) {
        this.worker.terminate ();
        this.worker = null;
    }
}
```

**清理时机**:
1. `Import()` 开始时调用 `Clear()` → `ClearContent()`
2. `onComplete` 回调中调用 `importer.Clear()`

**潜在问题**: 如果在 Worker 消息处理期间调用 `Clear()`，消息回调可能在 `worker.terminate()` 之后执行，此时 `this.worker` 已为 `null`。

---

## 5. 用户取消导入场景分析

### 5.1 现状：无显式取消机制

**代码审查结论**: Online3DViewer **没有提供** 显式的导入取消 API。

#### 不存在的取消机制

| 期望功能 | 实际情况 |
|---------|---------|
| `importer.Cancel()` 方法 | ❌ 不存在 |
| `onCancel` 回调 | ❌ 不存在 |
| 进度对话框的取消按钮 | ⚠️ 仅部分 UI 层有，但功能受限 |

#### UI 层的"取消"

**文件选择对话框** ([source/website/threemodelloaderui.js:108](source/website/threemodelloaderui.js)):

```javascript
name : Loc ('Cancel'),
```

这个"取消"仅针对文件选择对话框，不是针对正在进行的导入操作。

**导航中的 Cancel** ([source/engine/viewer/navigation.js:217](source/engine/viewer/navigation.js)):

```javascript
Cancel ()
{
    // 这是鼠标交互的取消（如旋转、缩放操作）
    // 与模型导入无关
}
```

### 5.2 间接"取消"方式

#### 方式 1: 重新触发导入

```javascript
// 用户第一次导入
viewer.LoadModelFromFileList(files1);  // 开始导入 A

// 导入过程中，用户又选择了新文件
viewer.LoadModelFromFileList(files2);  // 开始导入 B
```

**EmbeddedViewer 的处理** ([source/engine/viewer/embeddedviewer.js:109-134](source/engine/viewer/embeddedviewer.js)):

```javascript
LoadModelFromInputFiles (inputFiles)
{
    // ...
    this.viewer.Clear ();  // 清理当前显示
    // ...
    this.modelLoader.LoadModel (inputFiles, settings, {
        // ...
    });
}
```

**问题**: `this.viewer.Clear()` 只清理 Three.js 渲染资源，**不会中断** 正在进行的异步导入操作。

#### 方式 2: onSelectMainFile 返回 null

**多文件选择时的"取消"** ([source/engine/import/importer.js:170-186](source/engine/import/importer.js)):

```javascript
if (importableFiles.length === 1 || !callbacks.onSelectMainFile) {
    // 只有一个文件或没有选择回调，直接导入
    this.ImportLoadedMainFile (mainFile, settings, callbacks);
} else {
    // 多个文件，让用户选择主文件
    callbacks.onSelectMainFile (fileNames, (mainFileIndex) => {
        if (mainFileIndex === null) {
            // ⚠️ 用户"取消"选择
            callbacks.onImportError (new ImportError (ImportErrorCode.NoImportableFile));
            return;
        }
        // ...
    });
}
```

**这是唯一的"取消"点**，但只在多文件选择阶段有效，一旦开始解析就无法取消。

### 5.3 竞态条件分析

#### 场景：重叠导入

```
用户操作时序：
t0: 调用 LoadModelFromFileList([large.3dm]) → 开始加载 rhino3dm
t1: LoadExternalLibrary('rhino3dm') 发起网络请求
t2: 用户失去耐心，选择另一个文件 simple.stl
t3: 调用 LoadModelFromFileList([simple.stl])
t4: ImporterStl 不需要 WASM，快速导入成功
t5: 模型显示在屏幕上
t6: 此时 rhino3dm 脚本终于加载完成
t7: 旧的 Promise 回调执行
    - rhino3dm() 实例化
    - ImportRhinoContent() 解析 large.3dm
t8: 解析完成，旧的 callbacks 被调用
    ⚠️ 但 callbacks 已经是新导入的上下文了！
```

#### 竞态根源分析

**Importer.Import() 的实现** ([source/engine/import/importerbase.js:19-33](source/engine/import/importerbase.js)):

```javascript
Import (name, extension, content, callbacks)
{
    this.Clear ();  // 第一步：清理状态

    this.name = name;
    this.extension = extension;
    this.callbacks = callbacks;  // 保存新的 callbacks
    this.model = new Model ();
    this.error = false;
    this.message = null;
    this.ResetContent ();
    this.ImportContent (content, () => {
        // 异步完成后
        this.CreateResult (callbacks);
    });
}
```

**问题**: 旧的 `ImportContent` 异步回调捕获的是 **旧的 `callbacks` 参数**，而不是 `this.callbacks`。

```javascript
// 旧导入的 ImportContent 中的代码
ImportContent (fileContent, onFinish)
{
    LoadExternalLibrary ('rhino3dm').then (() => {
        // 这里捕获的是旧的 onFinish 回调
        // 即使 this.callbacks 已经变了，这个 onFinish 还是旧的
        onFinish ();
    });
}
```

#### 竞态后果

| 组件 | 竞态后的状态 |
|------|-------------|
| `this.callbacks` | 指向新导入的回调 |
| 旧 Promise 捕获的 `callbacks` | 指向旧导入的回调（已失效） |
| `this.model` | 新导入的 Model 对象 |
| 旧导入的解析结果 | 可能写入到新的 `this.model` |

**最糟糕的情况**: 旧的 rhino3dm 解析完成后，通过 `CreateResult(callbacks)` 调用旧的回调，而旧回调可能已经不存在或指向错误上下文。

---

## 6. 悬挂状态汇总

### 6.1 已识别的悬挂场景

| 场景 | 触发条件 | 悬挂表现 | 风险等级 |
|------|---------|---------|---------|
| **WASM 实例化失败** | `rhino3dm()` 或 `ifc.Init()` 拒绝且无 `.catch()` | `onFinish()` 永不调用 | 🔴 高 |
| **Fcstd Worker 崩溃后继续发送** | 处理多个对象时中间某个导致 Worker 崩溃 | 后续消息无响应，`onFinish()` 永不调用 | 🔴 高 |
| **重叠导入竞态** | 前一个导入的异步回调在后一个导入开始后执行 | 状态混乱，可能覆盖新导入的结果 | 🟡 中 |
| **WASM 单例永久持有** | rhino3dm/web-ifc 首次成功初始化后 | 内存不释放，直到页面刷新 | 🟢 低（设计意图） |
| **无取消机制** | 用户想中途停止但无法实现 | 只能等待或刷新页面 | 🟡 中 |

### 6.2 悬挂场景详细分析

#### 场景 1: WASM 实例化失败的悬挂

**代码路径** ([source/engine/import/importer3dm.js:48-65](source/engine/import/importer3dm.js)):

```javascript
LoadExternalLibrary ('rhino3dm').then (() => {
    rhino3dm ().then ((rhino) => {  // ⚠️ 这个 Promise 没有被 return
        this.rhino = rhino;
        this.ImportRhinoContent (fileContent);
        onFinish ();
    });
    // 没有 .catch()！
}).catch (() => {
    // 这个 catch 只能捕获 LoadExternalLibrary 的失败
    // 不能捕获 rhino3dm() 的失败！
    this.SetError (Loc ('Failed to load rhino3dm.'));
    onFinish ();
});
```

**Promise 链可视化**:

```
LoadExternalLibraryPromise
    ├── .then() → 返回 undefined（不是内部的 rhino3dmPromise）
    │               └── rhino3dmPromise
    │                       ├── .then() → 成功时调用 onFinish()
    │                       └── ❌ 无 .catch() → 失败时悬挂
    └── .catch() → 仅捕获 LoadExternalLibrary 的失败
```

**修复建议**:

```javascript
LoadExternalLibrary ('rhino3dm').then (() => {
    return rhino3dm ();  // ⚠️ return 内部 Promise
}).then ((rhino) => {
    this.rhino = rhino;
    this.ImportRhinoContent (fileContent);
    onFinish ();
}).catch (() => {
    // 现在能捕获所有错误了
    this.SetError (Loc ('Failed to load rhino3dm.'));
    onFinish ();
});
```

#### 场景 2: ImporterFcstd 的 Worker 崩溃悬挂

**问题代码** ([source/engine/import/importerfcstd.js:352-373](source/engine/import/importerfcstd.js)):

```javascript
let onFileConverted = (resultContent) => {
    if (resultContent !== null) {
        // 处理结果
    }
    convertedObjectCount += 1;  // ⚠️ 即使 resultContent 为 null（Worker 出错）也增加
    if (convertedObjectCount === objects.length) {
        onFinish ();
    } else {
        // ⚠️ 继续向已崩溃的 Worker 发送消息
        this.worker.postMessage ({...});
    }
};

this.worker.addEventListener ('error', (ev) => {
    onFileConverted (null);  // ⚠️ 1. 没有终止循环
                              // ⚠️ 2. 没有 SetError()
});
```

**修复建议**:

```javascript
let isWorkerDead = false;  // 新增标志

let onFileConverted = (resultContent) => {
    if (isWorkerDead) {
        return;  // Worker 已死，忽略后续消息
    }
    if (resultContent !== null) {
        // 处理结果
    } else {
        this.SetError (Loc ('Worker error during conversion.'));
    }
    convertedObjectCount += 1;
    if (convertedObjectCount === objects.length) {
        onFinish ();
    } else {
        this.worker.postMessage ({...});
    }
};

this.worker.addEventListener ('error', (ev) => {
    isWorkerDead = true;  // 标记 Worker 已死
    this.SetError (Loc ('Failed to process object.'));
    // 选项 A: 终止处理，报告错误
    onFinish ();
    // 选项 B: 如果需要部分结果，可以更复杂的处理
});
```

#### 场景 3: 重叠导入竞态

**问题根源**: 异步回调捕获的变量在调用时可能已失效。

**当前实现的问题**:

```javascript
// Importer3dm.ImportContent
ImportContent (fileContent, onFinish)
{
    if (this.rhino === null) {
        LoadExternalLibrary ('rhino3dm').then (() => {
            // 这里捕获的是 onFinish 参数
            // 如果此时新的 Import() 已被调用，this 的状态已改变
            // 但 onFinish 还是旧的
            rhino3dm ().then ((rhino) => {
                this.rhino = rhino;  // 覆盖新导入可能设置的值
                this.ImportRhinoContent (fileContent);  // 使用旧的 fileContent
                onFinish ();  // 调用旧的回调
            });
        });
    }
}
```

**修复建议**: 使用"世代计数器"或操作 ID

```javascript
export class Importer3dm extends ImporterBase
{
    constructor ()
    {
        super ();
        this.rhino = null;
        this.importGeneration = 0;  // 新增世代计数器
    }

    ImportContent (fileContent, onFinish)
    {
        this.importGeneration += 1;
        const currentGeneration = this.importGeneration;  // 捕获当前世代

        const checkGeneration = () => {
            return this.importGeneration === currentGeneration;
        };

        if (this.rhino === null) {
            LoadExternalLibrary ('rhino3dm').then (() => {
                if (!checkGeneration ()) {
                    return;  // 世代已变，放弃
                }
                return rhino3dm ();
            }).then ((rhino) => {
                if (!checkGeneration ()) {
                    return;  // 世代已变，放弃
                }
                this.rhino = rhino;
                this.ImportRhinoContent (fileContent);
                onFinish ();
            }).catch (() => {
                if (!checkGeneration ()) {
                    return;  // 世代已变，放弃
                }
                this.SetError (Loc ('Failed to load rhino3dm.'));
                onFinish ();
            });
        } else {
            // ...
        }
    }

    ClearContent ()
    {
        this.importGeneration += 1;  // 清理时增加世代，使旧回调失效
        // ...
    }
}
```

---

## 7. 资源释放保证分析

### 7.1 正常/错误流程的释放保证

**释放路径流程图**:

```
                    Import() 开始
                        │
                        ▼
              ┌───────────────────┐
              │   Clear()         │  ← 第一步清理
              │  - ClearContent() │     (Worker terminate)
              │  - 重置状态       │
              └─────────┬─────────┘
                        │
                        ▼
              ┌───────────────────┐
              │  ImportContent()  │  ← 实际解析（可能异步）
              │  (WASM 加载/解析) │
              └─────────┬─────────┘
                        │
              ┌─────────┴─────────┐
              │                   │
              ▼                   ▼
        ┌─────────┐         ┌─────────────┐
        │ 成功    │         │ 失败        │
        │         │         │             │
        │ SetError│         │ SetError()  │
        │ = false │         │ = true      │
        └────┬────┘         └──────┬──────┘
             │                     │
             └──────────┬──────────┘
                        ▼
              ┌───────────────────┐
              │   CreateResult()  │
              │                   │
              │ onSuccess/onError │  ← 结果回调
              │    onComplete     │  ← 总是调用！
              └─────────┬─────────┘
                        │
                        ▼
              ┌───────────────────┐
              │  importer.Clear() │  ← 最终清理
              │  - ClearContent() │     (Worker terminate)
              └───────────────────┘
```

### 7.2 各组件的释放行为

| 组件 | ClearContent() 行为 | 释放保证 |
|------|---------------------|---------|
| **Importer3dm** | 不释放 `this.rhino` | ❌ 单例永久持有（设计如此） |
| **ImporterIfc** | 不释放 `this.ifc` | ❌ 单例永久持有（设计如此） |
| **ImporterOcct** | `worker.terminate()` | ✅ 每次都释放 |
| **ImporterFcstd** | `worker.terminate()` | ✅ 每次都释放 |
| **ImporterGltf** | 不释放 `this.draco` | ❌ 单例永久持有 |

**单例持有是设计选择**，目的是避免重复的 WASM 编译/实例化开销。但在内存受限环境下可能成为问题。

### 7.3 缺失的释放机制

| 缺失功能 | 影响 | 建议 |
|---------|------|------|
| 显式 `Dispose()` 方法 | 用户无法主动释放 WASM 内存 | 添加 `importer.Dispose()` |
| 内存压力时的自动释放 | 低内存设备可能 OOM | 监听 `performance.memory` |
| Worker 错误后的状态清理 | 可能残留事件监听器 | 在 error 处理中 `removeEventListener` |

---

## 8. 改进建议汇总

### 8.1 高优先级修复

#### 1. Promise 错误处理完善

**所有 WASM 导入器** 需要：
- 正确 return 内部 Promise 使 `.catch()` 能捕获所有错误
- 或为每个 `.then()` 添加对应的 `.catch()`

**影响文件**:
- `source/engine/import/importer3dm.js`
- `source/engine/import/importerifc.js`
- `source/engine/import/importergltf.js`

#### 2. ImporterFcstd Worker 错误处理

**需要修复**:
- Worker error 时设置 `this.error = true`
- 决定是终止处理还是跳过失败对象继续
- 避免向已崩溃的 Worker 继续发送消息

**影响文件**:
- `source/engine/import/importerfcstd.js`

### 8.2 中优先级改进

#### 3. 竞态条件防护

**建议实现**:
- 世代计数器 (`importGeneration`)
- 每次 `Clear()` 时递增
- 异步回调开始时检查世代是否匹配

**影响范围**:
- 所有使用异步操作的导入器

#### 4. 显式取消 API

**建议设计**:

```javascript
// 新增接口
export class Importer
{
    // 现有方法...
    
    Cancel ()
    {
        this.isCancelled = true;
        // 触发 onCancel 回调
        if (this.callbacks && this.callbacks.onCancel) {
            this.callbacks.onCancel ();
        }
        // 清理资源
        this.Clear ();
    }
}

// 使用示例
const importer = new Importer();
importer.ImportFiles(files, settings, {
    onLoadStart: () => {},
    onCancel: () => {
        // 用户取消时的处理
    },
    // ...
});

// 用户点击取消按钮时
importer.Cancel();
```

### 8.3 低优先级优化

#### 5. 内存管理增强

**建议功能**:
- `Dispose()` 方法释放 WASM 单例实例
- 内存压力监控和自动释放
- 导入器池管理（避免重复创建/销毁）

#### 6. 错误信息增强

**建议改进**:
- 区分"脚本加载失败"和"WASM 实例化失败"
- 包含原始错误对象（如 `event`, `Error` 实例）
- 网络错误时包含状态码/URL 信息

---

## 附录: 关键代码位置索引

| 功能 | 文件路径 | 行号 |
|------|---------|------|
| 回调契约设计 | [source/engine/import/importerbase.js](source/engine/import/importerbase.js) | 46-68 |
| 错误码定义 | [source/engine/import/importer.js](source/engine/import/importer.js) | 29-35 |
| 脚本加载器 | [source/engine/io/externallibs.js](source/engine/io/externallibs.js) | 1-23 |
| rhino3dm 错误处理 | [source/engine/import/importer3dm.js](source/engine/import/importer3dm.js) | 48-65 |
| web-ifc 错误处理 | [source/engine/import/importerifc.js](source/engine/import/importerifc.js) | 43-60 |
| ImporterOcct Worker 错误 | [source/engine/import/importerocct.js](source/engine/import/importerocct.js) | 41-85 |
| ImporterFcstd Worker 错误 | [source/engine/import/importerfcstd.js](source/engine/import/importerfcstd.js) | 344-384 |
| 多文件选择取消 | [source/engine/import/importer.js](source/engine/import/importer.js) | 170-186 |
| Worker 清理 | [source/engine/import/importerocct.js](source/engine/import/importerocct.js) | 28-34 |
