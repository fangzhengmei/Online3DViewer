# Online3DViewer 导入器架构分析报告

## 一、概述

Online3DViewer 是一个支持十多种 3D 模型格式的 Web 查看器，其导入器架构设计采用了**策略模式 + 模板方法模式**，通过统一的基类定义生命周期钩子，各格式实现具体导入逻辑，并通过集中式路由器进行格式分发。

### 支持的格式列表

| 原生实现 | Three.js 桥接 |
|---------|--------------|
| OBJ, STL, OFF, PLY, 3DS, GLTF/GLB, IFC, 3DM, BIM, OCCT, Fcstd, SVG | FBX, DAE (Collada), WRL (VRML), 3MF, AMF |

---

## 二、导入器基类与生命周期钩子

### 2.1 基类设计 (`ImporterBase`)

**文件位置**: `source/engine/import/importerbase.js`

基类 `ImporterBase` 定义了完整的导入生命周期，使用**模板方法模式**固定导入流程，通过钩子方法让子类自定义格式解析逻辑。

### 2.2 核心生命周期方法

```
┌─────────────────────────────────────────────────────────────┐
│                      Import() 主入口                          │
│  (importerbase.js:19-33)                                    │
├─────────────────────────────────────────────────────────────┤
│  1. Clear()          → 清理状态                              │
│  2. ResetContent()   → 重置解析器状态 [钩子]                │
│  3. ImportContent()  → 解析文件内容 [核心钩子]              │
│  4. CreateResult()   → 生成最终结果                          │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 生命周期钩子详解

| 方法名 | 类型 | 作用 | 必须实现 |
|--------|------|------|---------|
| `CanImportExtension(extension)` | 能力判断钩子 | 判断是否支持该扩展名 | **是** |
| `GetUpDirection()` | 元信息钩子 | 返回模型的上方向 (Y/Z) | 否 (默认 Z) |
| `ClearContent()` | 清理钩子 | 清空格式特定的解析状态 | 否 |
| `ResetContent()` | 初始化钩子 | 重置格式特定的解析器状态 | 否 |
| `ImportContent(content, onFinish)` | **核心钩子** | 解析文件内容并构建模型 | **是** |

### 2.4 主导入流程代码解析

```javascript
// importerbase.js:19-33
Import (name, extension, content, callbacks)
{
    this.Clear();

    this.name = name;
    this.extension = extension;
    this.callbacks = callbacks;
    this.model = new Model();  // 创建新模型实例
    this.error = false;
    this.message = null;
    
    this.ResetContent();       // [钩子] 子类重置解析状态
    
    this.ImportContent(content, () => {  // [核心钩子] 子类解析内容
        this.CreateResult(callbacks);     // 生成结果并触发回调
    });
}
```

### 2.5 结果生成机制 (`CreateResult`)

```javascript
// importerbase.js:46-68
CreateResult (callbacks)
{
    if (this.error) {
        callbacks.onError();
        callbacks.onComplete();
        return;
    }

    if (IsModelEmpty(this.model)) {
        this.SetError(Loc('The model doesn\'t contain any meshes.'));
        callbacks.onError();
        callbacks.onComplete();
        return;
    }

    // 模型后处理：法线、边界框、材质默认值等
    FinalizeModel(this.model, {
        defaultLineMaterialColor: this.callbacks.getDefaultLineMaterialColor(),
        defaultMaterialColor: this.callbacks.getDefaultMaterialColor()
    });

    callbacks.onSuccess();
    callbacks.onComplete();
}
```

---

## 三、各格式导入器的钩子实现

### 3.1 OBJ 格式导入器 (`ImporterObj`)

**文件位置**: `source/engine/import/importerobj.js`

OBJ 是文本格式，需要处理 `.mtl` 材质文件和外部贴图。

#### 钩子实现：

```javascript
// importerobj.js:95-98
CanImportExtension (extension)
{
    return extension === 'obj';
}

// importerobj.js:100-103
GetUpDirection ()
{
    return Direction.Y;  // OBJ 默认 Y 向上
}

// importerobj.js:105-118
ClearContent ()
{
    this.globalVertices = null;
    this.globalNormals = null;
    this.globalUvs = null;
    this.currentMeshConverter = null;
    this.meshNameToConverter = null;
    this.materialNameToIndex = null;
}

// importerobj.js:120-133
ResetContent ()
{
    this.globalVertices = [];
    this.globalNormals = [];
    this.globalUvs = [];
    this.meshNameToConverter = new Map();
    this.materialNameToIndex = new Map();
}
```

#### 核心解析逻辑 (`ImportContent`)：

```javascript
// importerobj.js:135-144
ImportContent (fileContent, onFinish)
{
    let textContent = ArrayBufferToUtf8String(fileContent);
    ReadLines(textContent, (line) => {
        if (!this.WasError()) {
            this.ProcessLine(line);  // 逐行解析
        }
    });
    onFinish();
}
```

### 3.2 GLTF 格式导入器 (`ImporterGltf`)

**文件位置**: `source/engine/import/importergltf.js`

GLTF 支持文本格式 (`.gltf`) 和二进制格式 (`.glb`)，需要处理外部缓冲区和贴图。

#### 钩子实现：

```javascript
// importergltf.js:495-498
CanImportExtension (extension)
{
    return extension === 'gltf' || extension === 'glb';  // 支持两种格式
}

// importergltf.js:500-503
GetUpDirection ()
{
    return Direction.Y;  // GLTF 默认 Y 向上
}
```

#### 异步解析支持：

GLTF 支持扩展加载（如 Draco 压缩），因此 `ImportContent` 是异步的：

```javascript
// importergltf.js:517-524
ImportContent (fileContent, onFinish)
{
    if (this.extension === 'gltf') {
        this.ProcessGltf(fileContent, onFinish);
    } else if (this.extension === 'glb') {
        this.ProcessBinaryGltf(fileContent, onFinish);
    }
}
```

#### 扩展库异步加载示例：

```javascript
// importergltf.js:617-626
this.gltfExtensions.LoadLibraries(gltf.extensionsRequired, {
    onSuccess: () => {
        this.ImportModel(gltf);
        onFinish();
    },
    onError: (message) => {
        this.SetError(message);
        onFinish();
    }
});
```

### 3.3 Three.js 桥接导入器 (`ImporterThreeBase`)

**文件位置**: `source/engine/import/importerthree.js`

对于 Three.js 已有加载器的格式（FBX、Collada 等），使用桥接模式复用 Three.js 加载器。

#### 继承链：

```
ImporterBase
    └── ImporterThreeBase (桥接基类)
            ├── ImporterThreeFbx
            ├── ImporterThreeDae
            ├── ImporterThreeWrl
            ├── ImporterThree3mf
            └── ImporterThreeAmf
```

#### 核心桥接逻辑：

```javascript
// importerthree.js:58-111
LoadModel (fileContent, onFinish)
{
    let isAllLoadersDone = false;
    let loadingManager = new THREE.LoadingManager(() => {
        isAllLoadersDone = true;
    });

    const mainFileUrl = CreateObjectUrl(fileContent);
    
    // URL 修改器：处理依赖文件加载
    loadingManager.setURLModifier((url) => {
        if (url === mainFileUrl) return url;
        const buffer = this.callbacks.getFileBuffer(url);  // 通过回调获取依赖
        if (buffer !== null) {
            return CreateObjectUrl(buffer);
        }
        return url;
    });

    const threeLoader = this.CreateLoader(loadingManager);  // [钩子] 创建对应加载器
    threeLoader.load(mainFileUrl, (object) => {
        WaitWhile(() => {
            if (isAllLoadersDone) {
                this.OnThreeObjectsLoaded(object, onFinish);  // 转换 Three 对象到内部模型
                return false;
            }
            return true;
        });
    });
}
```

#### 子类只需实现两个钩子：

```javascript
// 示例: FBX 导入器
export class ImporterThreeFbx extends ImporterThreeBase
{
    CanImportExtension (extension)
    {
        return extension === 'fbx';
    }

    CreateLoader (manager)
    {
        manager.addHandler(/\.tga$/i, new TGALoader(manager));
        return new FBXLoader(manager);  // 返回 Three.js FBX 加载器
    }
}
```

---

## 四、格式路由逻辑

### 4.1 导入器注册表 (`Importer`)

**文件位置**: `source/engine/import/importer.js`

`Importer` 类是中央路由器，负责：
1. 注册所有支持的导入器
2. 根据文件扩展名匹配对应导入器
3. 协调多文件加载流程

### 4.2 导入器注册

```javascript
// importer.js:80-105
export class Importer
{
    constructor ()
    {
        this.importers = [
            new ImporterObj(),
            new ImporterStl(),
            new ImporterOff(),
            new ImporterPly(),
            new Importer3ds(),
            new ImporterGltf(),
            new ImporterBim(),
            new Importer3dm(),
            new ImporterIfc(),
            new ImporterOcct(),
            new ImporterFcstd(),
            new ImporterThreeFbx(),   // Three.js 桥接
            new ImporterThreeDae(),
            new ImporterThreeWrl(),
            new ImporterThree3mf(),
            new ImporterThreeAmf()
        ];
        this.fileList = new ImporterFileList();
    }
    
    AddImporter (importer)  // 支持动态扩展
    {
        this.importers.push(importer);
    }
}
```

### 4.3 格式匹配算法

```javascript
// importer.js:289-315
GetImportableFiles (fileList)
{
    function FindImporter (file, importers)
    {
        for (let importerIndex = 0; importerIndex < importers.length; importerIndex++) {
            let importer = importers[importerIndex];
            if (importer.CanImportExtension(file.extension)) {
                return importer;  // 顺序匹配，先注册优先
            }
        }
        return null;
    }

    let importableFiles = [];
    let files = fileList.GetFiles();
    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
        let file = files[fileIndex];
        let importer = FindImporter(file, this.importers);
        if (importer !== null) {
            importableFiles.push({
                file: file,
                importer: importer
            });
        }
    }
    return importableFiles;
}
```

**匹配规则**:
- 基于**文件扩展名**（不区分大小写）
- 按注册顺序**优先匹配**
- 一个文件可能被多个导入器支持，但只返回第一个匹配的

### 4.4 主文件选择机制

当存在多个可导入文件时：

```javascript
// importer.js:162-186
ImportLoadedFiles (settings, callbacks)
{
    let importableFiles = this.GetImportableFiles(this.fileList);
    
    if (importableFiles.length === 0) {
        callbacks.onImportError(new ImportError(ImportErrorCode.NoImportableFile));
        return;
    }

    // 策略: 单个文件直接导入，多个文件让用户选择
    if (importableFiles.length === 1 || !callbacks.onSelectMainFile) {
        let mainFile = importableFiles[0];
        this.ImportLoadedMainFile(mainFile, settings, callbacks);
    } else {
        // 回调 UI 层让用户选择主文件
        let fileNames = importableFiles.map(importableFile => importableFile.file.name);
        callbacks.onSelectMainFile(fileNames, (mainFileIndex) => {
            let mainFile = importableFiles[mainFileIndex];
            this.ImportLoadedMainFile(mainFile, settings, callbacks);
        });
    }
}
```

---

## 五、多文件依赖追踪与协同加载

### 5.1 文件管理体系

```
┌─────────────────────────────────────────────────────────────┐
│                    文件管理层级                                │
├─────────────────────────────────────────────────────────────┤
│  InputFile          → 用户输入的原始文件表示                  │
│  ImporterFile       → 导入器内部使用的文件包装               │
│  ImporterFileList   → 文件列表管理（查找、扩展、加载）        │
│  ImporterFileAccessor → 带缓存的文件访问器                    │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 文件列表管理 (`ImporterFileList`)

**文件位置**: `source/engine/import/importerfiles.js`

```javascript
// importerfiles.js:60-164
export class ImporterFileList
{
    constructor ()
    {
        this.files = [];
    }

    // 从用户输入填充文件列表
    FillFromInputFiles (inputFiles) { ... }

    // 扩展文件列表（用于补充缺失的依赖文件）
    ExtendFromFileList (fileList) { ... }

    // 并行加载所有文件内容
    GetContent (callbacks)
    {
        RunTasks(this.files.length, {
            runTask: (index, onTaskComplete) => {
                this.GetFileContent(this.files[index], {
                    onReady: onTaskComplete,
                    onProgress: callbacks.onFileLoadProgress
                });
            },
            onReady: callbacks.onReady
        });
    }

    // 按文件名查找（不区分大小写）
    FindFileByPath (filePath)
    {
        let fileName = GetFileName(filePath).toLowerCase();
        for (let fileIndex = 0; fileIndex < this.files.length; fileIndex++) {
            let file = this.files[fileIndex];
            if (file.name.toLowerCase() === fileName) {
                return file;
            }
        }
        return null;
    }
}
```

### 5.3 依赖文件访问机制

#### 5.3.1 文件访问器 (`ImporterFileAccessor`)

```javascript
// importer.js:59-77
export class ImporterFileAccessor
{
    constructor (getBufferCallback)
    {
        this.getBufferCallback = getBufferCallback;
        this.fileBuffers = new Map();  // 缓存已访问的文件
    }

    GetFileBuffer (filePath)
    {
        let fileName = GetFileName(filePath);
        if (this.fileBuffers.has(fileName)) {
            return this.fileBuffers.get(fileName);  // 命中缓存
        }
        let buffer = this.getBufferCallback(fileName);
        this.fileBuffers.set(fileName, buffer);
        return buffer;
    }
}
```

#### 5.3.2 使用追踪机制

在 `ImportLoadedMainFile` 中追踪文件使用情况：

```javascript
// importer.js:188-248
ImportLoadedMainFile (mainFile, settings, callbacks)
{
    this.usedFiles = [];
    this.missingFiles = [];
    this.usedFiles.push(mainFile.file.name);  // 主文件已使用

    // 创建文件访问器，追踪使用/缺失
    let fileAccessor = new ImporterFileAccessor((fileName) => {
        let fileBuffer = null;
        let file = this.fileList.FindFileByPath(fileName);
        if (file === null || file.content === null) {
            this.missingFiles.push(fileName);  // 记录缺失文件
            fileBuffer = null;
        } else {
            this.usedFiles.push(fileName);     // 记录已使用文件
            fileBuffer = file.content;
        }
        return fileBuffer;
    });

    // 传给导入器的回调
    importer.Import(mainFile.file.name, mainFile.file.extension, mainFile.file.content, {
        getFileBuffer: (filePath) => {
            return fileAccessor.GetFileBuffer(filePath);  // 导入器通过此回调获取依赖
        },
        // ... 其他回调
    });
}
```

### 5.4 导入器中获取依赖文件的示例

#### OBJ 材质文件加载：

```javascript
// importerobj.js:313-327
ProcessMaterialParameter (keyword, parameters, line)
{
    // ...
    } else if (keyword === 'mtllib') {
        // 遇到 mtllib 指令，加载对应的 .mtl 文件
        let fileName = NameFromLine(line, keyword.length, '#');
        let fileBuffer = this.callbacks.getFileBuffer(fileName);  // 通过回调获取
        if (fileBuffer !== null) {
            let textContent = ArrayBufferToUtf8String(fileBuffer);
            ReadLines(textContent, (line) => {
                if (!this.WasError()) {
                    this.ProcessLine(line);  // 复用同一解析器处理材质
                }
            });
        }
        return true;
    }
    // ...
}
```

#### OBJ 贴图加载：

```javascript
// importerobj.js:259-289
function CreateTexture (parameters, callbacks)
{
    let texture = new TextureMap();
    let textureName = parameters[parameters.length - 1];
    let textureBuffer = callbacks.getFileBuffer(textureName);  // 获取贴图文件
    texture.name = textureName;
    texture.buffer = textureBuffer;  // 存储到纹理对象
    // ... 处理纹理参数 (offset, scale 等)
    return texture;
}
```

#### GLTF 外部缓冲区加载：

```javascript
// importergltf.js:536-554
ProcessGltf (fileContent, onFinish)
{
    // ... 解析 JSON
    
    for (let i = 0; i < gltf.buffers.length; i++) {
        let buffer = null;
        let gltfBuffer = gltf.buffers[i];
        
        // 尝试 base64 内嵌
        let base64Buffer = Base64DataURIToArrayBuffer(gltfBuffer.uri);
        if (base64Buffer !== null) {
            buffer = base64Buffer.buffer;
        } else {
            // 尝试外部文件
            let fileBuffer = this.callbacks.getFileBuffer(gltfBuffer.uri);
            if (fileBuffer !== null) {
                buffer = fileBuffer;
            }
        }
        
        if (buffer === null) {
            this.SetError(Loc('One of the requested buffers is missing.'));
            onFinish();
            return;
        }
        this.bufferContents.push(buffer);
    }
}
```

### 5.5 智能文件列表更新策略

支持"补充缺失文件"的场景：

```javascript
// importer.js:129-160
LoadFiles (inputFiles, callbacks)
{
    let newFileList = new ImporterFileList();
    newFileList.FillFromInputFiles(inputFiles);

    let reset = false;
    if (this.HasImportableFile(newFileList)) {
        // 新文件包含可导入格式 → 完全重置
        reset = true;
    } else {
        // 新文件不包含可导入格式
        // 检查是否是补充之前缺失的依赖文件
        let foundMissingFile = false;
        for (let i = 0; i < this.missingFiles.length; i++) {
            let missingFile = this.missingFiles[i];
            if (newFileList.ContainsFileByPath(missingFile)) {
                foundMissingFile = true;
            }
        }
        if (!foundMissingFile) {
            // 既不是可导入文件，也不是缺失依赖 → 重置
            reset = true;
        } else {
            // 是补充的依赖文件 → 扩展现有列表，不重置
            this.fileList.ExtendFromFileList(newFileList);
            reset = false;
        }
    }
    
    if (reset) {
        this.fileList = newFileList;
    }
    // ... 加载文件内容
}
```

### 5.6 结果中的文件追踪

导入结果包含完整的文件使用信息：

```javascript
// importer.js:47-57
export class ImportResult
{
    constructor ()
    {
        this.model = null;
        this.mainFile = null;       // 主文件名
        this.upVector = null;       // 上方向
        this.usedFiles = null;      // 所有使用过的文件列表
        this.missingFiles = null;   // 尝试加载但缺失的文件列表
    }
}
```

---

## 六、完整导入流程图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           完整导入流程                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  用户传入 InputFile[]                                                        │
│       │                                                                      │
│       ▼                                                                      │
│  ┌─────────────────────┐                                                     │
│  │  Importer.ImportFiles()                                                  │
│  │  (importer.js:112-127)                                                   │
│  └─────────────────────┘                                                     │
│       │                                                                      │
│       ▼                                                                      │
│  ┌─────────────────────────────────────────────┐                            │
│  │  Phase 1: 文件加载 (LoadFiles)              │                            │
│  │  • 智能判断是重置还是扩展文件列表             │                            │
│  │  • 并行加载所有文件内容                       │                            │
│  │  • 支持 ZIP 压缩包自动解压                   │                            │
│  └─────────────────────────────────────────────┘                            │
│       │                                                                      │
│       ▼                                                                      │
│  ┌─────────────────────────────────────────────┐                            │
│  │  Phase 2: 格式匹配 (GetImportableFiles)     │                            │
│  │  • 遍历注册的导入器                          │                            │
│  │  • 调用 CanImportExtension() 匹配           │                            │
│  │  • 生成 (file, importer) 配对列表           │                            │
│  └─────────────────────────────────────────────┘                            │
│       │                                                                      │
│       ▼                                                                      │
│  ┌─────────────────────────────────────────────┐                            │
│  │  Phase 3: 主文件选择                         │                            │
│  │  • 单文件: 自动选择                          │                            │
│  │  • 多文件: 回调 UI 让用户选择                │                            │
│  └─────────────────────────────────────────────┘                            │
│       │                                                                      │
│       ▼                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Phase 4: 实际导入 (ImporterBase.Import())                               ││
│  │                                                                           ││
│  │   ImporterBase.Import()                                                  ││
│  │        │                                                                  ││
│  │        ├──► Clear()              清理状态                                ││
│  │        │                                                                  ││
│  │        ├──► ResetContent()       [钩子] 子类初始化解析器                ││
│  │        │                                                                  ││
│  │        ├──► ImportContent()      [核心钩子] 子类解析文件               ││
│  │        │       │                                                          ││
│  │        │       ├── 解析过程中通过 callbacks.getFileBuffer() 获取依赖   ││
│  │        │       ├── 依赖文件被 ImporterFileAccessor 缓存和追踪          ││
│  │        │       └── 完成后调用 onFinish()                                 ││
│  │        │                                                                  ││
│  │        └──► CreateResult()       后处理 + 触发回调                       ││
│  │                │                                                          ││
│  │                ├── FinalizeModel()  模型后处理                          ││
│  │                ├── onSuccess()       成功回调                            ││
│  │                └── onComplete()      完成回调                            ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│       │                                                                      │
│       ▼                                                                      │
│  ImportResult { model, mainFile, usedFiles, missingFiles, upVector }       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 七、架构亮点总结

| 设计要点 | 实现方式 | 优势 |
|---------|---------|------|
| **统一生命周期** | 模板方法模式固定导入流程 | 所有格式遵循一致的生命周期，易于理解和维护 |
| **策略式扩展** | 基类钩子 + 注册表 | 添加新格式只需实现 `ImporterBase` 并注册 |
| **桥接复用** | `ImporterThreeBase` 桥接 Three.js 加载器 | 复用成熟生态，减少重复开发 |
| **依赖追踪** | `ImporterFileAccessor` + `usedFiles/missingFiles` | 精确定位缺失文件，支持增量补充 |
| **智能列表更新** | 判断新文件是"可导入文件"还是"依赖补充" | 支持用户先拖入主文件，后拖入缺失贴图的场景 |
| **异步友好** | `ImportContent` 接收 `onFinish` 回调 | 支持异步加载外部库（Draco、WebIFC 等） |
| **统一数据模型** | 所有导入器输出相同的 `Model` 结构 | 下游渲染/导出逻辑不感知格式差异 |

---

## 八、关键文件索引

| 功能模块 | 文件路径 |
|---------|---------|
| 导入器基类 | `source/engine/import/importerbase.js` |
| 中央路由器 | `source/engine/import/importer.js` |
| 文件管理 | `source/engine/import/importerfiles.js` |
| 工具函数 | `source/engine/import/importerutils.js` |
| OBJ 导入器 | `source/engine/import/importerobj.js` |
| GLTF 导入器 | `source/engine/import/importergltf.js` |
| 3DS 导入器 | `source/engine/import/importer3ds.js` |
| Three.js 桥接 | `source/engine/import/importerthree.js` |
| 模型数据结构 | `source/engine/model/model.js` |
| 模型后处理 | `source/engine/model/modelfinalization.js` |
