# Online3DViewer WebAssembly 集成分析报告

## 1. 多套 WASM 库的按需加载策略

### 1.1 集成的 WASM 库概览

Online3DViewer 集成了多套 WebAssembly 原生库来处理不同格式的 3D 模型文件：

| 库名称 | 支持文件格式 | 用途 | 版本 |
|--------|-------------|------|------|
| **rhino3dm** | `.3dm` | Rhino 3D 模型解析 | 8.17.0 |
| **web-ifc** | `.ifc` | 建筑信息模型 (BIM) 解析 | 0.0.68 |
| **occt-import-js** | `.stp`, `.step`, `.igs`, `.iges`, `.brp`, `.brep` | OpenCascade 几何内核 STEP/IGES/BRep 解析 | 0.0.22 |
| **draco3d** | glTF 内嵌 Draco | 网格压缩数据解码 | 1.5.7 |

### 1.2 加载决策机制

加载决策基于 **文件扩展名** 进行，通过 `Importer` 类的 `GetImportableFiles` 方法实现：

**核心逻辑** ([source/engine/import/importer.js:289-315](source/engine/import/importer.js)):

```javascript
GetImportableFiles (fileList)
{
    function FindImporter (file, importers)
    {
        for (let importerIndex = 0; importerIndex < importers.length; importerIndex++) {
            let importer = importers[importerIndex];
            if (importer.CanImportExtension (file.extension)) {
                return importer;
            }
        }
        return null;
    }
    // ...
}
```

每个 `Importer` 子类实现 `CanImportExtension` 方法来声明自己支持的格式：

- **Importer3dm**: 支持 `.3dm`
- **ImporterIfc**: 支持 `.ifc`
- **ImporterOcct**: 支持 `.stp`, `.step`, `.igs`, `.iges`, `.brp`, `.brep`

### 1.3 外部库加载实现

外部库通过 `LoadExternalLibrary` 函数从 CDN 动态加载：

**加载器实现** ([source/engine/import/importerutils.js:134-145](source/engine/import/importerutils.js)):

```javascript
export function LoadExternalLibrary (libraryName)
{
    if (libraryName === 'rhino3dm') {
        return LoadExternalLibraryFromUrl ('https://cdn.jsdelivr.net/npm/rhino3dm@8.17.0/rhino3dm.min.js');
    } else if (libraryName === 'webifc') {
        return LoadExternalLibraryFromUrl ('https://cdn.jsdelivr.net/npm/web-ifc@0.0.68/web-ifc-api-iife.js');
    } else if (libraryName === 'draco3d') {
        return LoadExternalLibraryFromUrl ('https://cdn.jsdelivr.net/npm/draco3d@1.5.7/draco_decoder_nodejs.min.js');
    } else {
        return null;
    }
}
```

**底层脚本加载** ([source/engine/io/externallibs.js:1-23](source/engine/io/externallibs.js)):

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
        // ...
    });
}
```

**关键特性**:
- **单例缓存**: 使用 `loadedExternalLibUrls` Set 避免重复加载
- **Promise 封装**: 异步加载，便于链式调用
- **CDN 托管**: 所有外部库通过 jsDelivr CDN 加载

### 1.4 OCCT Worker 特殊处理

OpenCascade 库采用 **Web Worker** 隔离执行，加载逻辑更复杂：

**Worker 创建** ([source/engine/import/importerutils.js:105-132](source/engine/import/importerutils.js)):

```javascript
let occtWorkerUrl = null;

export function CreateOcctWorker (worker)
{
    return new Promise ((resolve, reject) => {
        if (occtWorkerUrl !== null) {
            resolve (new Worker (occtWorkerUrl));
            return;
        }

        let baseUrl = 'https://cdn.jsdelivr.net/npm/occt-import-js@0.0.22/dist/';
        fetch (baseUrl + 'occt-import-js-worker.js')
            .then ((response) => {
                if (!response.ok) {
                    return reject ();
                }
                return response.text ();
            })
            .then ((workerScript) => {
                workerScript = workerScript.replace ('occt-import-js.js', baseUrl + 'occt-import-js.js');
                workerScript = workerScript.replace ('return path', 'return \'' + baseUrl + 'occt-import-js.wasm\'');
                let blob = new Blob ([workerScript], { type : 'text/javascript' });
                occtWorkerUrl = URL.createObjectURL (blob);
                return resolve (new Worker (occtWorkerUrl));
            })
            .catch (reject);
    });
}
```

**Worker 模式优势**:
- **路径重写**: 动态修改 Worker 脚本中的资源路径指向 CDN
- **Blob URL**: 使用 `URL.createObjectURL` 创建内联 Worker 避免跨域问题
- **单例 URL**: `occtWorkerUrl` 缓存避免重复 fetch 和 blob 创建

---

## 2. WASM 库的异步初始化流程与 JS 主线程协作机制

### 2.1 初始化流程架构

所有导入器继承自 `ImporterBase`，采用统一的异步初始化模式：

**基类导入流程** ([source/engine/import/importerbase.js:19-33](source/engine/import/importerbase.js)):

```javascript
Import (name, extension, content, callbacks)
{
    this.Clear ();

    this.name = name;
    this.extension = extension;
    this.callbacks = callbacks;
    this.model = new Model ();
    this.error = false;
    this.message = null;
    this.ResetContent ();
    this.ImportContent (content, () => {
        this.CreateResult (callbacks);
    });
}
```

### 2.2 不同库的初始化模式对比

#### 模式 A: Promise 链式初始化 (rhino3dm, web-ifc)

**rhino3dm 初始化** ([source/engine/import/importer3dm.js:48-65](source/engine/import/importer3dm.js)):

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
            this.SetError (Loc ('Failed to load rhino3dm.'));
            onFinish ();
        });
    } else {
        this.ImportRhinoContent (fileContent);
        onFinish ();
    }
}
```

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
        }).catch (() => {
            this.SetError (Loc ('Failed to load web-ifc.'));
            onFinish ();
        });
    } else {
        this.ImportIfcContent (fileContent);
        onFinish ();
    }
}
```

**Promise 模式特点**:
- **延迟初始化**: 首次导入时才初始化 WASM 模块
- **实例缓存**: 初始化后复用实例 (`this.rhino`, `this.ifc`)
- **错误隔离**: 每个导入器独立管理自己的 WASM 实例

#### 模式 B: Worker 消息驱动 (occt-import-js)

**OCCT Worker 通信** ([source/engine/import/importerocct.js:41-85](source/engine/import/importerocct.js)):

```javascript
ImportContent (fileContent, onFinish)
{
    CreateOcctWorker ().then ((worker) => {
        this.worker = worker;
        this.worker.addEventListener ('message', (ev) => {
            this.ImportResultJson (ev.data, onFinish);
        });
        this.worker.addEventListener ('error', (ev) => {
            this.SetError (Loc ('Failed to load occt-import-js.'));
            onFinish ();
        });

        // ... 格式检测和参数准备

        let fileBuffer = new Uint8Array (fileContent);
        this.worker.postMessage ({
            format : format,
            buffer : fileBuffer,
            params : params
        });
    }).catch (() => {
        this.SetError (Loc ('Failed to load occt-import-js.'));
        onFinish ();
    });
}
```

**Worker 模式特点**:
- **完全隔离**: 计算密集型操作在 Worker 线程执行，不阻塞 UI
- **消息驱动**: 通过 `postMessage` / `onmessage` 通信
- **每次新建**: 每次导入创建新 Worker（但 Worker 脚本 URL 缓存）

### 2.3 任务调度与主线程协作

#### TaskRunner 异步任务管理

**TaskRunner 实现** ([source/engine/core/taskrunner.js:1-88](source/engine/core/taskrunner.js)):

```javascript
export class TaskRunner
{
    Run (count, callbacks)
    {
        this.count = count;
        this.current = 0;
        this.callbacks = callbacks;
        if (count === 0) {
            this.TaskReady ();
        } else {
            this.RunOnce ();
        }
    }

    RunOnce ()
    {
        setTimeout (() => {
            this.callbacks.runTask (this.current, this.TaskReady.bind (this));
        }, 0);
    }
    // ...
}

export function RunTaskAsync (task)
{
    setTimeout (() => {
        task ();
    }, 10);
}
```

#### 导入流程中的异步调度

**主导入流程** ([source/engine/import/importer.js:112-127](source/engine/import/importer.js)):

```javascript
ImportFiles (inputFiles, settings, callbacks)
{
    callbacks.onLoadStart ();
    this.LoadFiles (inputFiles, {
        onReady : () => {
            callbacks.onImportStart ();
            RunTaskAsync (() => {
                this.DecompressArchives (this.fileList, () => {
                    this.ImportLoadedFiles (settings, callbacks);
                });
            });
        },
        // ...
    });
}
```

**协作机制要点**:
- **setTimeout(0) 让步**: 使用 `setTimeout` 让主线程有机会处理 UI 事件
- **回调驱动**: 全程使用回调函数 `onSuccess`, `onError`, `onComplete`
- **分层异步**: 文件加载 → 解压 → 解析 → 结果处理 各阶段异步衔接

---

## 3. 跨语言边界的内存管理

### 3.1 数据传递机制

#### TypedArray 二进制数据传递

**文件内容传递** (以 rhino3dm 为例, [source/engine/import/importer3dm.js:69](source/engine/import/importer3dm.js)):

```javascript
let rhinoDoc = this.rhino.File3dm.fromByteArray (fileContent);
```

**web-ifc 数据传递** ([source/engine/import/importerifc.js:64-67](source/engine/import/importerifc.js)):

```javascript
const fileBuffer = new Uint8Array (fileContent);
const modelID = this.ifc.OpenModel (fileBuffer, {
    COORDINATE_TO_ORIGIN : true
});
```

**数据流向**:
1. JS 侧: `ArrayBuffer` / `Uint8Array` 持有文件内容
2. WASM 侧: 通过 Emscripten 生成的绑定函数访问
3. **共享 vs 拷贝**: 取决于库的绑定实现，通常 TypedArray 数据会被拷贝到 WASM 线性内存

#### Worker 结构化数据传递

**OCCT Worker 消息格式** ([source/engine/import/importerocct.js:76-80](source/engine/import/importerocct.js)):

```javascript
this.worker.postMessage ({
    format : format,
    buffer : fileBuffer,
    params : params
});
```

**结果返回** ([source/engine/import/importerocct.js:87-97](source/engine/import/importerocct.js)):

```javascript
ImportResultJson (resultContent, onFinish)
{
    if (!resultContent.success) {
        onFinish ();
        return;
    }
    let colorToMaterial = new ColorToMaterialConverter (this.model);
    let rootNode = this.model.GetRootNode ();
    this.ImportNode (resultContent, resultContent.root, rootNode, colorToMaterial);
    onFinish ();
}
```

**Worker 通信特点**:
- **结构化 JSON**: 结果通过 JSON 序列化传递
- **结构化克隆**: `postMessage` 使用结构化克隆算法
- **可转移对象**: 大数组可使用 `Transferable` 减少拷贝（当前实现未使用）

### 3.2 WASM 对象生命周期管理

#### rhino3dm 显式内存管理

**对象释放示例** ([source/engine/import/importer3dm.js:137-167](source/engine/import/importer3dm.js)):

```javascript
} else if (objectType === this.rhino.ObjectType.Extrusion) {
    let rhinoMesh = rhinoGeometry.getMesh (this.rhino.MeshType.Any);
    if (rhinoMesh !== null) {
        this.ImportRhinoGeometryAsMesh (rhinoDoc, rhinoMesh, rhinoObject, rhinoInstanceReferences);
        rhinoMesh.delete ();  // 显式释放
    }
} else if (objectType === this.rhino.ObjectType.Brep) {
    let rhinoMesh = new this.rhino.Mesh ();
    let faces = rhinoGeometry.faces ();
    for (let i = 0; i < faces.count; i++) {
        let face = faces.get (i);
        let mesh = face.getMesh (this.rhino.MeshType.Any);
        if (mesh) {
            rhinoMesh.append (mesh);
            mesh.delete ();  // 显式释放
        }
        face.delete ();  // 显式释放
    }
    faces.delete ();  // 显式释放
    rhinoMesh.compact ();
    this.ImportRhinoGeometryAsMesh (rhinoDoc, rhinoMesh, rhinoObject, rhinoInstanceReferences);
    rhinoMesh.delete ();  // 显式释放
}
```

**rhino3dm 内存模式**:
- **手动 `.delete()`**: 所有创建/获取的 WASM 对象必须显式调用 `delete()`
- **RAII 缺失**: JS 无析构函数，完全依赖开发者手动管理
- **迭代器模式**: `faces.get(i)` 返回新对象，每次都需释放

#### web-ifc 模型级管理

**模型生命周期** ([source/engine/import/importerifc.js:62-77](source/engine/import/importerifc.js)):

```javascript
ImportIfcContent (fileContent)
{
    const fileBuffer = new Uint8Array (fileContent);
    const modelID = this.ifc.OpenModel (fileBuffer, {
        COORDINATE_TO_ORIGIN : true
    });
    const ifcMeshes = this.ifc.LoadAllGeometry (modelID);
    // ... 处理几何体
    this.ImportProperties (modelID);
    this.ifc.CloseModel (modelID);  // 关闭模型释放资源
}
```

**web-ifc 内存模式**:
- **模型句柄**: 通过 `modelID` 整数句柄引用
- **Open/Close 配对**: `OpenModel` 必须与 `CloseModel` 配对
- **API 封装**: 几何数据通过 `GetVertexArray` / `GetIndexArray` 获取

#### OCCT Worker 进程级隔离

**Worker 清理** ([source/engine/import/importerocct.js:28-34](source/engine/import/importerocct.js)):

```javascript
ClearContent ()
{
    if (this.worker !== null) {
        this.worker.terminate ();
        this.worker = null;
    }
}
```

**Worker 模式优势**:
- **终止即释放**: `worker.terminate()` 终止整个线程，WASM 内存随进程销毁
- **无手动管理**: 无需追踪单个 WASM 对象
- **每次新 Worker**: 每次导入创建新 Worker，避免状态污染

### 3.3 内存泄漏防护策略

#### 策略 1: ClearContent 钩子

**基类设计** ([source/engine/import/importerbase.js:80-88](source/engine/import/importerbase.js)):

```javascript
ClearContent ()
{
    // 子类重写以释放特定资源
}

ResetContent ()
{
    // 子类重写以初始化导入状态
}
```

**调用时机** ([source/engine/import/importerbase.js:35-44](source/engine/import/importerbase.js)):

```javascript
Clear ()
{
    this.name = null;
    this.extension = null;
    this.callbacks = null;
    this.model = null;
    this.error = null;
    this.message = null;
    this.ClearContent ();  // 触发子类资源释放
}
```

**导入完成清理** ([source/engine/import/importer.js:244-247](source/engine/import/importer.js)):

```javascript
onComplete : () => {
    importer.Clear ();  // 导入完成后清理
}
```

#### 策略 2: 单例复用避免重复初始化

**实例缓存模式** (以 `Importer3dm` 为例):

```javascript
// 构造函数
constructor ()
{
    super ();
    this.rhino = null;  // 缓存 WASM 实例
}

// ImportContent 中
if (this.rhino === null) {
    // 首次使用时初始化
} else {
    // 复用已初始化实例
}

// ClearContent 不释放 this.rhino
ClearContent ()
{
    this.instanceIdToObject = null;
    this.instanceIdToDefinition = null;
    // 注意: this.rhino 保持不释放
}
```

**权衡设计**:
- **优点**: 避免重复初始化 WASM 模块的开销
- **缺点**: 长期持有 WASM 内存，直到页面刷新
- **适用场景**: rhino3dm, web-ifc 等模块初始化成本高

#### 策略 3: Worker 隔离

**OCCT 选择 Worker 模式的原因**:
1. **计算密集**: STEP/IGES 解析需要大量几何计算
2. **内存不确定**: OpenCascade 内部内存管理复杂
3. **安全网**: Worker 终止保证资源完全释放

**对比总结表**:

| 策略 | 适用库 | 实现方式 | 优点 | 缺点 |
|------|--------|----------|------|------|
| **手动 delete** | rhino3dm | `.delete()` 调用 | 精确控制 | 易遗漏 |
| **句柄模式** | web-ifc | `OpenModel`/`CloseModel` | 结构清晰 | 需配对调用 |
| **Worker 隔离** | occt-import-js | `worker.terminate()` | 自动释放 | 启动开销 |
| **单例复用** | rhino3dm, web-ifc | 实例缓存 | 避免重复初始化 | 长期占用内存 |

---

## 4. 架构总结

### 4.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                         JS 主线程 (UI)                            │
│  ┌─────────────┐    ┌─────────────┐    ┌──────────────────┐   │
│  │  Importer   │    │ TaskRunner  │    │  Model (JS对象)   │   │
│  │  (调度器)    │───▶│ (异步调度)  │───▶│  (最终结果)       │   │
│  └─────────────┘    └─────────────┘    └──────────────────┘   │
│         │                                                         │
│         ▼                                                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              具体导入器 (Importer 子类)                    │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │   │
│  │  │Importer3dm│  │ImporterIfc│  │   ImporterOcct      │  │   │
│  │  │ (rhino3dm)│  │(web-ifc) │  │ (occt-import-js)    │  │   │
│  │  └────┬─────┘  └────┬─────┘  └──────────┬───────────┘  │   │
│  │       │             │                    │               │   │
│  │       ▼             ▼                    ▼               │   │
│  │  ┌─────────┐   ┌─────────┐     ┌──────────────────┐  │   │
│  │  │ WASM    │   │ WASM    │     │   Web Worker     │  │   │
│  │  │(主线程内)│   │(主线程内)│     │  ┌────────────┐  │  │   │
│  │  │         │   │         │     │  │  WASM      │  │  │   │
│  │  │ rhino3dm│   │ web-ifc │     │  │occt-import │  │  │   │
│  │  │ .wasm   │   │ .wasm   │     │  │  .wasm     │  │  │   │
│  │  └─────────┘   └─────────┘     │  └────────────┘  │  │   │
│  │                                 └──────────────────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 关键设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| **加载时机** | 按需延迟加载 | 减少初始加载体积，提升首屏速度 |
| **加载源** | CDN (jsDelivr) | 利用 CDN 缓存，减轻自身服务器压力 |
| **执行模式** | 混合模式 (主线程 + Worker) | 简单库主线程执行，复杂计算 Worker 隔离 |
| **内存管理** | 多层策略 | 针对不同库的特性选择最合适的管理方式 |
| **初始化** | 单例复用 | 避免 WASM 编译/实例化的重复开销 |

### 4.3 潜在改进点

1. **Worker 可转移对象**: OCCT Worker 的 `postMessage` 可使用 `Transferable` 传递 `ArrayBuffer`，减少内存拷贝
2. **WASM 实例池**: 对于频繁使用的格式，可考虑 Worker 池而非每次新建
3. **内存监控**: 增加 WASM 内存使用监控，在内存紧张时主动释放单例实例
4. **错误恢复**: 增强 `ClearContent` 的健壮性，确保异常情况下也能正确释放资源

---

## 附录: 相关文件索引

| 文件路径 | 功能描述 |
|----------|----------|
| [source/engine/import/importer.js](source/engine/import/importer.js) | 主导入调度器，管理所有导入器 |
| [source/engine/import/importerbase.js](source/engine/import/importerbase.js) | 导入器基类，定义生命周期钩子 |
| [source/engine/import/importer3dm.js](source/engine/import/importer3dm.js) | Rhino 3DM 导入器 (rhino3dm WASM) |
| [source/engine/import/importerifc.js](source/engine/import/importerifc.js) | IFC 导入器 (web-ifc WASM) |
| [source/engine/import/importerocct.js](source/engine/import/importerocct.js) | STEP/IGES 导入器 (OCCT Worker) |
| [source/engine/import/importerutils.js](source/engine/import/importerutils.js) | 外部库加载工具函数 |
| [source/engine/io/externallibs.js](source/engine/io/externallibs.js) | 底层脚本加载器 |
| [source/engine/core/taskrunner.js](source/engine/core/taskrunner.js) | 异步任务调度器 |
