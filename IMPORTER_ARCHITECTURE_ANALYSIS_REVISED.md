# Online3DViewer 导入器架构分析报告（纠偏版）

> **重要提示**：本报告是对上一版分析的全面核对与纠偏，修正了多处关键偏差。

---

## 一、关键纠偏摘要

| 问题 | 上一版结论 | 真实行为 |
|------|-----------|---------|
| SVG 支持 | 归入 Three.js 桥接 | **代码存在但默认未注册**，实际不支持 |
| OCCT 格式 | 单一格式 | **支持 6 种扩展名**：stp, step, igs, iges, brp, brep |
| 导入策略分类 | 原生/桥接二元划分 | 需**三维分类**：纯原生、外部库桥接、Three.js 桥接 |
| 扩展条件 | "补充缺失依赖" | 需满足**双条件**：非可导入文件 + 匹配之前的 missingFiles |
| 缓存与追踪关系 | 一起工作 | `ImporterFileAccessor` 的缓存**不影响** `usedFiles/missingFiles` 追踪 |

---

## 二、默认注册的导入器清单（按注册顺序）

**文件位置**: `source/engine/import/importer.js:83-99`

```javascript
this.importers = [
    new ImporterObj(),        // #1
    new ImporterStl(),        // #2
    new ImporterOff(),        // #3
    new ImporterPly(),        // #4
    new Importer3ds(),        // #5
    new ImporterGltf(),       // #6
    new ImporterBim(),        // #7
    new Importer3dm(),        // #8
    new ImporterIfc(),        // #9
    new ImporterOcct(),       // #10 (多格式: stp/step/igs/iges/brp/brep)
    new ImporterFcstd(),      // #11
    new ImporterThreeFbx(),   // #12
    new ImporterThreeDae(),   // #13
    new ImporterThreeWrl(),   // #14
    new ImporterThree3mf(),   // #15
    new ImporterThreeAmf()    // #16
];
```

**⚠️ 重要发现**：`ImporterThreeSvg`（位于 `importersvg.js`）虽然代码存在，但**既未被 import，也未被注册**，默认情况下不支持 SVG 格式。

---

## 三、导入策略四维映射表

### 3.1 策略分类体系

根据实现方式和依赖程度，导入器可分为三类：

| 类别 | 定义 | 外部依赖 | 示例 |
|------|------|---------|------|
| **A. 纯原生实现** | 完全自主解析，无任何外部运行时依赖 | 无 | OBJ, STL, OFF, PLY, 3DS, BIM |
| **B. 外部库桥接** | 依赖外部 WASM 或 JS 库进行解析 | 首次使用时动态加载 | 3DM (rhino3dm), IFC (web-ifc), OCCT/Fcstd (occt-import-js) |
| **C. Three.js 桥接** | 复用 Three.js 及其示例加载器 | 编译时打包 | FBX, DAE, WRL, 3MF, AMF |

### 3.2 完整映射表

按**注册顺序**排列，四个维度的完整映射：

| 注册顺序 | 导入器类 | 能力判断 (CanImportExtension) | 方向约定 (GetUpDirection) | 状态清理 (Clear/ResetContent) | 核心解析 (ImportContent) | 策略类别 |
|---------|---------|-------------------------------|---------------------------|-------------------------------|--------------------------|---------|
| 1 | `ImporterObj` | `extension === 'obj'` | `Direction.Y` | **Clear**: 清零 vertices/normals/uvs 等数组<br>**Reset**: 初始化为空数组 + Map | 同步逐行解析，处理 `mtllib` 时通过 `callbacks.getFileBuffer()` 加载材质文件 | **A. 纯原生** |
| 2 | `ImporterStl` | `extension === 'stl'` | `Direction.Z` | **Clear**: 清零 mesh/triangle<br>**Reset**: 创建新 Mesh 并添加到 RootNode | 同步解析，自动检测文本/二进制格式 | **A. 纯原生** |
| 3 | `ImporterOff` | `extension === 'off'` | `Direction.Y` | **Clear**: 清零 mesh/status/colorToMaterial<br>**Reset**: 创建 Mesh + 状态机 + ColorToMaterialConverter | 同步逐行解析，支持顶点色/面色 | **A. 纯原生** |
| 4 | `ImporterPly` | `extension === 'ply'` | `Direction.Y` | **Clear**: 清零 mesh<br>**Reset**: 创建新 Mesh 并添加到 RootNode | 同步解析，先读头部分辨 ascii/binary_little_endian/binary_big_endian | **A. 纯原生** |
| 5 | `Importer3ds` | `extension === '3ds'` | `Direction.Z` | **Clear**: 清零 materialNameToIndex/meshNameToIndex/nodeList<br>**Reset**: 初始化为空 Map + Importer3dsNodeList | 同步解析二进制 Chunk 结构，通过 `callbacks.getFileBuffer()` 加载贴图 | **A. 纯原生** |
| 6 | `ImporterGltf` | `extension === 'gltf' \|\| extension === 'glb'` | `Direction.Y` | **Clear**: 清零 bufferContents/imageIndexToTextureParams<br>**Reset**: 初始化为空数组 + Map | **异步**: 文本/二进制分流，遇到 Draco 扩展时动态加载 `draco3d`，通过 `callbacks.getFileBuffer()` 加载外部 buffer/image | **A. 纯原生**<br>(可选依赖: Draco) |
| 7 | `ImporterBim` | `extension === 'bim'` | `Direction.Z` | **Clear**: 清零 meshIdToMesh/colorToMaterial<br>**Reset**: 初始化为空 Map + ColorToMaterialConverter | 同步解析自定义 JSON 格式 | **A. 纯原生** |
| 8 | `Importer3dm` | `extension === '3dm'` | `Direction.Z` | **Clear**: 清零 instanceIdToObject/instanceIdToDefinition<br>**Reset**: 初始化为空 Map | **异步**: 首次使用时动态加载 `rhino3dm`，通过 `callbacks.getFileBuffer()` 加载贴图 | **B. 外部库桥接**<br>(依赖: rhino3dm) |
| 9 | `ImporterIfc` | `extension === 'ifc'` | `Direction.Y` | **Clear**: 清零 expressIDToMesh/colorToMaterial<br>**Reset**: 初始化为空 Map + ColorToMaterialConverter | **异步**: 首次使用时动态加载 `web-ifc`，纯单文件无外部依赖 | **B. 外部库桥接**<br>(依赖: web-ifc) |
| 10 | `ImporterOcct` | `extension === 'stp' \|\| 'step' \|\| 'igs' \|\| 'iges' \|\| 'brp' \|\| 'brep'` | `Direction.Y` | **Clear**: terminate Worker 并置空<br>**Reset**: 置空 worker | **异步**: 每次都创建新的 `occt-import-js` Worker，通过消息通信解析 | **B. 外部库桥接**<br>(依赖: occt-import-js) |
| 11 | `ImporterFcstd` | `extension === 'fcstd'` | `Direction.Z` | **Clear**: terminate Worker + 清零 document<br>**Reset**: 置空 worker + 创建 FreeCadDocument | **异步**: 先用 `fflate` 解压 ZIP，再创建 `occt-import-js` Worker 解析内部 brep | **B. 外部库桥接**<br>(依赖: occt-import-js, fflate) |
| 12 | `ImporterThreeFbx` | `extension === 'fbx'` | `Direction.Y` | (继承自 ImporterThreeBase)<br>**Clear**: 清零 loader/materialIdToIndex/objectUrlToFileName<br>**Reset**: 置空 loader + 初始化 Map | **异步**: 通过 `THREE.LoadingManager` + `FBXLoader` 加载，URL 重写器调用 `callbacks.getFileBuffer()` 获取依赖 | **C. Three.js 桥接**<br>(依赖: three.js FBXLoader) |
| 13 | `ImporterThreeDae` | `extension === 'dae'` | `Direction.Y` | (继承自 ImporterThreeBase) | 同上，使用 `ColladaLoader`，`GetMainObject` 返回 `loadedObject.scene` | **C. Three.js 桥接** |
| 14 | `ImporterThreeWrl` | `extension === 'wrl'` | `Direction.Y` | (继承自 ImporterThreeBase) | 同上，使用 `VRMLLoader`，重写 `IsMeshVisible` 过滤 BackSide | **C. Three.js 桥接** |
| 15 | `ImporterThree3mf` | `extension === '3mf'` | `Direction.Z` | (继承自 ImporterThreeBase) | 同上，使用 `ThreeMFLoader`，`colorConverter` 设为 `ThreeSRGBToLinearColorConverter` | **C. Three.js 桥接** |
| 16 | `ImporterThreeAmf` | `extension === 'amf'` | `Direction.Z` | (继承自 ImporterThreeBase) | 同上，使用 `AMFLoader` | **C. Three.js 桥接** |

---

## 四、各策略类别的详细特征

### 4.1 类别 A：纯原生实现

**定义**：完全使用原生 JavaScript 解析，不依赖任何外部运行时库（编译时依赖不算）。

**共 7 个**：Obj, Stl, Off, Ply, 3ds, Gltf, Bim

**共同特征**：

| 特征 | 说明 |
|------|------|
| 同步/异步 | 大部分同步，Gltf 因可选的 Draco 扩展而为异步 |
| 外部依赖 | 无（Gltf 的 Draco 是可选的，不影响基础功能） |
| 多文件支持 | Obj, 3ds, Gltf 通过 `callbacks.getFileBuffer()` 加载依赖 |

**关键代码示例 (ImporterObj 加载材质)**:

```javascript
// importerobj.js:313-327
} else if (keyword === 'mtllib') {
    let fileName = NameFromLine(line, keyword.length, '#');
    let fileBuffer = this.callbacks.getFileBuffer(fileName);  // 从回调获取
    if (fileBuffer !== null) {
        let textContent = ArrayBufferToUtf8String(fileBuffer);
        ReadLines(textContent, (line) => {
            if (!this.WasError()) {
                this.ProcessLine(line);  // 复用同一解析器
            }
        });
    }
    return true;
}
```

### 4.2 类别 B：外部库桥接

**定义**：依赖外部 WASM 或 JS 库进行核心解析，这些库通常在首次使用时动态下载。

**共 4 个**：3dm, Ifc, Occt, Fcstd

**共同特征**：

| 特征 | 说明 |
|------|------|
| 加载方式 | 全部异步，通过 Promise 或 Worker 消息 |
| 库加载时机 | 首次使用时动态加载（懒加载） |
| 库来源 | 均从 CDN 加载：jsdelivr.net |

**外部库依赖表**:

| 导入器 | 依赖库 | CDN 地址 | 加载方式 |
|--------|--------|---------|---------|
| Importer3dm | rhino3dm | `https://cdn.jsdelivr.net/npm/rhino3dm@8.17.0/rhino3dm.min.js` | `LoadExternalLibrary` + Promise |
| ImporterIfc | web-ifc | `https://cdn.jsdelivr.net/npm/web-ifc@0.0.68/web-ifc-api-iife.js` | `LoadExternalLibrary` + Promise |
| ImporterOcct | occt-import-js | `https://cdn.jsdelivr.net/npm/occt-import-js@0.0.22/dist/` | 创建 Worker，动态构建 Worker 脚本 |
| ImporterFcstd | occt-import-js + fflate | 同上 | 先用 fflate 解压 ZIP，再用 Worker 解析 |

**关键代码示例 (Importer3dm 懒加载)**:

```javascript
// importer3dm.js:48-65
ImportContent (fileContent, onFinish)
{
    if (this.rhino === null) {  // 首次使用时加载
        LoadExternalLibrary('rhino3dm').then(() => {
            rhino3dm().then((rhino) => {
                this.rhino = rhino;  // 缓存实例
                this.ImportRhinoContent(fileContent);
                onFinish();
            });
        }).catch(() => {
            this.SetError(Loc('Failed to load rhino3dm.'));
            onFinish();
        });
    } else {
        this.ImportRhinoContent(fileContent);  // 后续直接使用缓存
        onFinish();
    }
}
```

### 4.3 类别 C：Three.js 桥接

**定义**：通过 `ImporterThreeBase` 基类复用 Three.js 生态中的加载器。

**共 5 个**：Fbx, Dae, Wrl, 3mf, Amf

**继承体系**:

```
ImporterBase
    └── ImporterThreeBase (桥接基类)
            ├── ImporterThreeFbx  (FBXLoader)
            ├── ImporterThreeDae  (ColladaLoader)
            ├── ImporterThreeWrl  (VRMLLoader)
            ├── ImporterThree3mf  (ThreeMFLoader)
            └── ImporterThreeAmf  (AMFLoader)
```

**核心桥接机制**：

`ImporterThreeBase` 的核心创新在于 `LoadingManager.setURLModifier` + Blob URL：

```javascript
// importerthree.js:70-86
const mainFileUrl = CreateObjectUrl(fileContent);

loadingManager.setURLModifier((url) => {
    if (url === mainFileUrl) {
        return url;
    }
    const name = GetFileName(url);
    const extension = GetFileExtension(url);
    if (extension.length > 0) {
        const buffer = this.callbacks.getFileBuffer(url);  // 从内部文件池获取
        if (buffer !== null) {
            let objectUrl = CreateObjectUrl(buffer);  // 创建 Blob URL
            this.objectUrlToFileName.set(objectUrl, name);
            return objectUrl;  // 返回 Blob URL 给 Three.js 加载器
        }
    }
    return url;  // 找不到就原样返回（可能导致网络请求失败）
});
```

**工作原理**:
1. 将 `ArrayBuffer` 包装为 Blob URL，让 Three.js 加载器认为是在加载网络资源
2. 通过 `URLModifier` 拦截所有依赖请求，从内部文件池获取
3. 对每个依赖文件也创建 Blob URL，形成完整的虚拟文件系统

**子类钩子**:

| 钩子方法 | 作用 | 是否必须覆盖 |
|---------|------|-------------|
| `CreateLoader(manager)` | 创建对应的 Three.js 加载器 | **是** |
| `GetMainObject(loadedObject)` | 从加载结果中提取根 Object3D | 否（默认返回 loadedObject） |
| `IsMeshVisible(mesh)` | 判断是否可见（用于过滤） | 否（默认返回 true） |

**示例: ImporterThreeDae 覆盖 `GetMainObject`**:

```javascript
// importerthree.js:338-341
GetMainObject (loadedObject)
{
    return loadedObject.scene;  // Collada 加载结果是 { scene, ... }
}
```

---

## 五、格式路由逻辑（纠偏版）

### 5.1 路由算法

**文件位置**: `source/engine/import/importer.js:289-315`

```javascript
GetImportableFiles (fileList)
{
    function FindImporter (file, importers)
    {
        for (let importerIndex = 0; importerIndex < importers.length; importerIndex++) {
            let importer = importers[importerIndex];
            if (importer.CanImportExtension(file.extension)) {
                return importer;  // 第一个匹配即返回
            }
        }
        return null;
    }
    // ...
}
```

**关键结论**：
- ✅ 上一版正确：按**注册顺序**匹配，第一个匹配的导入器获胜
- ✅ 无扩展名冲突：所有 `CanImportExtension` 的范围互不重叠

### 5.2 扩展名覆盖范围汇总

| 导入器 | 支持的扩展名 | 数量 |
|--------|-------------|------|
| ImporterObj | obj | 1 |
| ImporterStl | stl | 1 |
| ImporterOff | off | 1 |
| ImporterPly | ply | 1 |
| Importer3ds | 3ds | 1 |
| ImporterGltf | gltf, glb | 2 |
| ImporterBim | bim | 1 |
| Importer3dm | 3dm | 1 |
| ImporterIfc | ifc | 1 |
| **ImporterOcct** | **stp, step, igs, iges, brp, brep** | **6** |
| ImporterFcstd | fcstd | 1 |
| ImporterThreeFbx | fbx | 1 |
| ImporterThreeDae | dae | 1 |
| ImporterThreeWrl | wrl | 1 |
| ImporterThree3mf | 3mf | 1 |
| ImporterThreeAmf | amf | 1 |

**⚠️ 纠偏点**：`ImporterOcct` 实际支持 **6 种 CAD 格式**，不是单一格式！

### 5.3 动态扩展机制

```javascript
// importer.js:107-110
AddImporter (importer)
{
    this.importers.push(importer);  // 追加到末尾，优先级最低
}
```

---

## 六、多文件依赖追踪机制（纠偏版）

### 6.1 关键纠偏：缓存与追踪是分离的

上一版分析混淆了两个层次：

| 层次 | 类 | 作用 | 是否影响 usedFiles/missingFiles |
|------|-----|------|-------------------------------|
| **追踪层** | `Importer` 内的匿名回调 | 记录使用/缺失 | **是**，每次调用都判断 |
| **缓存层** | `ImporterFileAccessor` | 避免重复 `getBufferCallback` | **否**，缓存命中时不触发回调 |

**关键代码**:

```javascript
// importer.js:205-216
let fileAccessor = new ImporterFileAccessor((fileName) => {
    // 【追踪层】这个回调才会更新 usedFiles/missingFiles
    let fileBuffer = null;
    let file = this.fileList.FindFileByPath(fileName);
    if (file === null || file.content === null) {
        this.missingFiles.push(fileName);  // 追踪缺失
        fileBuffer = null;
    } else {
        this.usedFiles.push(fileName);     // 追踪使用
        fileBuffer = file.content;
    }
    return fileBuffer;
});

// importer.js:60-77 (ImporterFileAccessor)
GetFileBuffer (filePath)
{
    let fileName = GetFileName(filePath);
    if (this.fileBuffers.has(fileName)) {
        return this.fileBuffers.get(fileName);  // 【缓存层】命中缓存，不触发回调
    }
    let buffer = this.getBufferCallback(fileName);  // 未命中才触发回调
    this.fileBuffers.set(fileName, buffer);
    return buffer;
}
```

**⚠️ 重要结论**：
- 同一个依赖文件**只在第一次访问时**被追踪
- 后续访问从缓存获取，**不会**重复记录到 `usedFiles`

### 6.2 文件列表扩展条件（精确版）

**文件位置**: `source/engine/import/importer.js:129-160`

```javascript
LoadFiles (inputFiles, callbacks)
{
    let newFileList = new ImporterFileList();
    newFileList.FillFromInputFiles(inputFiles);

    let reset = false;
    
    // 条件 A: 新文件包含可导入格式？
    if (this.HasImportableFile(newFileList)) {
        reset = true;  // → 完全重置
    } else {
        // 新文件不包含可导入格式
        // 条件 B: 是否包含之前记录的 missingFiles 中的任何一个？
        let foundMissingFile = false;
        for (let i = 0; i < this.missingFiles.length; i++) {
            let missingFile = this.missingFiles[i];
            if (newFileList.ContainsFileByPath(missingFile)) {
                foundMissingFile = true;
            }
        }
        
        // 条件 C: 既不是可导入文件，也不是缺失文件？
        if (!foundMissingFile) {
            reset = true;  // → 还是要重置
        } else {
            // 【唯一的扩展情况】
            // 新文件既不是可导入文件，又恰好是之前缺失的依赖
            this.fileList.ExtendFromFileList(newFileList);  // → 扩展
            reset = false;
        }
    }
    
    if (reset) {
        this.fileList = newFileList;
    }
    // ...
}
```

**决策表**：

| 新文件类型 | 之前有导入记录？ | 是否匹配 missingFiles？ | 行为 |
|-----------|-----------------|------------------------|------|
| 包含可导入文件 | 任意 | 任意 | 重置 (reset = true) |
| 不包含可导入文件 | 无 | 无意义 (missingFiles 为空) | 重置 (reset = true) |
| 不包含可导入文件 | 有 | **否** | 重置 (reset = true) |
| 不包含可导入文件 | 有 | **是** | **扩展** (reset = false) |

**⚠️ 纠偏点**：
- 上一版说"支持用户先拖入主文件，后拖入缺失贴图"——这**部分正确**，但有前提：
  1. 第一次导入必须因缺失文件而失败（这样 `missingFiles` 才会被记录）
  2. 第二次拖入的文件**不能是可导入格式**（否则会触发重置）
  3. 第二次拖入的文件必须**恰好匹配之前的 `missingFiles`**

### 6.3 文件名匹配策略

**文件位置**: `source/engine/import/importerfiles.js:111-121`

```javascript
FindFileByPath (filePath)
{
    let fileName = GetFileName(filePath).toLowerCase();  // 提取文件名 + 小写
    for (let fileIndex = 0; fileIndex < this.files.length; fileIndex++) {
        let file = this.files[fileIndex];
        if (file.name.toLowerCase() === fileName) {  // 只比较文件名，不比较路径
            return file;
        }
    }
    return null;
}
```

**关键特征**：
- **路径无关**：只比较文件名（通过 `GetFileName` 提取）
- **大小写不敏感**：全部转为小写比较
- **无目录结构**：不支持子目录查找

**示例**：
- 查找 `textures/wood.png` → 实际查找 `wood.png`
- 文件 `Wood.PNG` 可以匹配 `wood.png`

---

## 七、完整导入链路流程图（纠偏版）

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                              完整导入链路（纠偏后）                                  │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│  用户传入 InputFile[]                                                            │
│       │                                                                           │
│       ▼                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  Phase 1: LoadFiles() - 文件加载与列表管理                                │    │
│  ├─────────────────────────────────────────────────────────────────────────┤    │
│  │                                                                           │    │
│  │  决策树（精确版）:                                                        │    │
│  │                                                                           │    │
│  │  新文件是否包含可导入格式？                                                │    │
│  │       │                                                                   │    │
│  │       ├── 是 ──────► reset = true  (完全替换 fileList)                  │    │
│  │       │                                                                   │    │
│  │       └── 否 ──────► 新文件是否匹配之前的 missingFiles？                 │    │
│  │                        │                                                  │    │
│  │                        ├── 是 ──► reset = false (扩展 fileList)         │    │
│  │                        │                                                  │    │
│  │                        └── 否 ──► reset = true  (替换 fileList)         │    │
│  │                                                                           │    │
│  │  然后: 并行加载所有文件内容 (FileReader 或 fetch)                        │    │
│  │  然后: 自动解压 ZIP 文件，内容追加到 fileList                             │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│       │                                                                           │
│       ▼                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  Phase 2: GetImportableFiles() - 格式匹配                                │    │
│  ├─────────────────────────────────────────────────────────────────────────┤    │
│  │                                                                           │    │
│  │  for each file in fileList:                                              │    │
│  │      for each importer in importers[] (按注册顺序):                      │    │
│  │          if importer.CanImportExtension(file.extension):                │    │
│  │              匹配成功，记录 (file, importer)，跳出内层循环              │    │
│  │                                                                           │    │
│  │  生成 importableFiles[] 列表                                              │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│       │                                                                           │
│       ▼                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  Phase 3: 主文件选择                                                      │    │
│  ├─────────────────────────────────────────────────────────────────────────┤    │
│  │                                                                           │    │
│  │  if importableFiles.length === 0:                                        │    │
│  │      报错: NoImportableFile                                               │    │
│  │                                                                           │    │
│  │  else if importableFiles.length === 1:                                   │    │
│  │      自动选择唯一的文件                                                    │    │
│  │                                                                           │    │
│  │  else:                                                                    │    │
│  │      回调 onSelectMainFile() 让用户选择                                   │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│       │                                                                           │
│       ▼                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  Phase 4: ImportLoadedMainFile() - 执行导入                              │    │
│  ├─────────────────────────────────────────────────────────────────────────┤    │
│  │                                                                           │    │
│  │  1. 初始化追踪器:                                                         │    │
│  │     usedFiles = [mainFile]                                               │    │
│  │     missingFiles = []                                                     │    │
│  │                                                                           │    │
│  │  2. 创建双层文件访问器:                                                    │    │
│  │     ┌──────────────────────────────────────────────────────────────┐     │    │
│  │     │  ImporterFileAccessor                                          │     │    │
│  │     │  ┌────────────────────────────────────────────────────────┐  │     │    │
│  │     │  │ 缓存层: fileBuffers Map                                 │  │     │    │
│  │     │  │  - 命中缓存直接返回，不触发回调                          │  │     │    │
│  │     │  └────────────────────────────────────────────────────────┘  │     │    │
│  │     │                           │                                    │     │    │
│  │     │                           ▼ (未命中)                            │     │    │
│  │     │  ┌────────────────────────────────────────────────────────┐  │     │    │
│  │     │  │ 追踪层: getBufferCallback (匿名函数)                     │  │     │    │
│  │     │  │  - 查找文件                                              │  │     │    │
│  │     │  │  - 找到: usedFiles.push(fileName)                        │  │     │    │
│  │     │  │  - 没找到: missingFiles.push(fileName)                   │  │     │    │
│  │     │  └────────────────────────────────────────────────────────┘  │     │    │
│  │     └──────────────────────────────────────────────────────────────┘     │    │
│  │                                                                           │    │
│  │  3. 调用 importer.Import()                                                │    │
│  │     传入 callbacks: { getFileBuffer, onSuccess, onError, onComplete }   │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│       │                                                                           │
│       ▼                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  Phase 5: ImporterBase.Import() - 基类生命周期                          │    │
│  ├─────────────────────────────────────────────────────────────────────────┤    │
│  │                                                                           │    │
│  │  Import(name, extension, content, callbacks)                             │    │
│  │       │                                                                   │    │
│  │       ├──► Clear()                清理所有状态                           │    │
│  │       │                                                                   │    │
│  │       ├──► 初始化: name, extension, callbacks, model = new Model()      │    │
│  │       │                                                                   │    │
│  │       ├──► ResetContent()         [钩子] 子类初始化解析器状态            │    │
│  │       │                                                                   │    │
│  │       ├──► ImportContent()      [核心钩子] 子类解析                     │    │
│  │       │       │                                                          │    │
│  │       │       ├─ 纯原生: 同步解析 (Obj, Stl, Off, Ply, 3ds, Bim)      │    │
│  │       │       │                                                          │    │
│  │       │       ├─ 异步原生: Gltf (Draco 可选)                           │    │
│  │       │       │                                                          │    │
│  │       │       ├─ 外部库桥接: 3dm, Ifc, Occt, Fcstd (动态加载库)        │    │
│  │       │       │                                                          │    │
│  │       │       └─ Three.js 桥接: 通过 LoadingManager + Blob URL         │    │
│  │       │                                                                  │    │
│  │       │       解析过程中:                                                │    │
│  │       │       - 通过 callbacks.getFileBuffer() 获取依赖文件             │    │
│  │       │       - 依赖访问被上述双层访问器拦截和追踪                      │    │
│  │       │                                                                  │    │
│  │       └──► CreateResult()       后处理 + 触发回调                       │    │
│  │                │                                                          │    │
│  │                ├── 错误? → onError()                                     │    │
│  │                │                                                          │    │
│  │                ├── 空模型? → onError()                                   │    │
│  │                │                                                          │    │
│  │                └── FinalizeModel() → onSuccess() → onComplete()         │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│       │                                                                           │
│       ▼                                                                           │
│  ImportResult {                                                                   │
│      model: Model,                                                                │
│      mainFile: string,                                                            │
│      upVector: Direction,                                                         │
│      usedFiles: string[],    ← 追踪结果：所有使用过的文件                       │
│      missingFiles: string[]  ← 追踪结果：所有缺失的文件                         │
│  }                                                                                │
│                                                                                   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 八、偏差修正对照表

| 序号 | 上一版分析 | 真实行为（纠偏后） | 影响程度 |
|------|-----------|-------------------|---------|
| 1 | SVG 归入 Three.js 桥接 | `ImporterThreeSvg` **代码存在但未注册**，默认不支持 SVG | 🔴 高 |
| 2 | OCCT 是单一格式 | `ImporterOcct` 支持 **6 种扩展名**：stp, step, igs, iges, brp, brep | 🟡 中 |
| 3 | 导入策略二元划分（原生/桥接） | 需要**三维划分**：纯原生、外部库桥接、Three.js 桥接 | 🟡 中 |
| 4 | ImporterFileAccessor 的缓存与追踪一起工作 | 缓存层和追踪层是**分离的**，缓存命中时不触发追踪 | 🟡 中 |
| 5 | "补充缺失文件"是简单行为 | 需要满足**双条件**：新文件不可导入 + 匹配之前的 missingFiles | 🔴 高 |
| 6 | 文件名匹配考虑路径 | `FindFileByPath` **只比较文件名**，通过 `GetFileName` 提取后比较 | 🟡 中 |
| 7 | 所有导入器分类正确 | `ImporterGltf` 应归入**纯原生**（Draco 是可选依赖，不影响基础功能） | 🟢 低 |

---

## 九、关键文件索引

| 文件 | 路径 | 核心职责 |
|------|------|---------|
| 导入器基类 | `source/engine/import/importerbase.js` | 定义生命周期钩子 |
| 中央路由器 | `source/engine/import/importer.js` | 注册导入器、格式匹配、文件追踪 |
| 文件管理 | `source/engine/import/importerfiles.js` | 文件列表、查找、内容加载 |
| 工具函数 | `source/engine/import/importerutils.js` | 外部库加载、材质处理等 |
| Three.js 桥接基类 | `source/engine/import/importerthree.js` | 复用 Three.js 加载器的框架 |
| **(未注册)** SVG 导入器 | `source/engine/import/importersvg.js` | 代码存在但未被 import/注册 |

---

## 十、结论与建议

### 10.1 架构设计的优点

1. **清晰的生命周期**：`ImporterBase` 的模板方法模式让所有导入器遵循一致的流程
2. **灵活的扩展机制**：`AddImporter` 支持运行时添加新格式
3. **智能的文件列表管理**：支持"补充缺失依赖"的场景（虽然条件较严格）
4. **分层的依赖追踪**：缓存层和追踪层分离，兼顾性能和可观测性
5. **统一的错误处理**：`usedFiles`/`missingFiles` 让 UI 层可以精确提示用户缺失哪些文件

### 10.2 潜在问题与限制

1. **SVG 导入器被遗忘**：`ImporterThreeSvg` 代码存在但未注册，可能是遗漏
2. **扩展条件过于严格**：用户需要知道"不能拖入其他可导入文件"才能补充依赖，不够直观
3. **文件名匹配太宽松**：不考虑路径，不同目录下同名文件会冲突
4. **缺少优先级机制**：只能按注册顺序匹配，无法让用户指定优先级
5. **外部库版本固定**：CDN 地址硬编码，无法选择不同版本

### 10.3 待验证问题

以下问题本次静态分析无法完全确定，需要实际测试验证：

1. **动态扩展的导入器是否能正确处理依赖**？`AddImporter` 添加的导入器是否能正常使用 `callbacks.getFileBuffer`？
2. **解压后的文件如何追踪**？`DecompressArchives` 解压 ZIP 后，依赖访问是否会正确记录到 `usedFiles`？
3. **`missingFiles` 的生命周期**：什么时候被清空？重置文件列表时是否保留？

---

*报告生成时间: 2026-04-29*
