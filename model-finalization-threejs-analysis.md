# Online3DViewer 模型 Finalization、Three.js 转换与 Viewer 架构分析

## 目录
1. [整体数据流转概述](#整体数据流转概述)
2. [Finalization 阶段：拓扑与材质计算](#finalization-阶段拓扑与材质计算)
3. [Three.js 转换器：几何与材质缓存](#threejs-转换器几何与材质缓存)
4. [Viewer 层：生命周期管理与选中状态同步](#viewer-层生命周期管理与选中状态同步)
5. [独立内部模型层：设计原则与实际好处](#独立内部模型层设计原则与实际好处)

---

## 整体数据流转概述

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           数据流转管道                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────┐    ┌─────────┐ │
│  │ 各种3D   │───▶│  Importer    │───▶│  Internal    │───▶│  Final  │ │
│  │ 格式文件  │    │  (格式解析)   │    │  Model       │    │ization │ │
│  │          │    │              │    │  (OV自有模型) │    │         │ │
│  └──────────┘    └──────────────┘    └──────────────┘    └────┬────┘ │
│                                                                   │       │
│                      ┌────────────────────────────────────────────┘       │
│                      ▼                                                       │
│              ┌────────────────┐    ┌──────────────┐    ┌────────────────┐│
│              │ ThreeConverter │───▶│ THREE.Object │───▶│   Viewer      ││
│              │  (带缓存机制)   │    │   3D场景树   │    │ (场景+交互)   ││
│              └────────────────┘    └──────────────┘    └────────────────┘│
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

核心设计理念：**Importer 只做格式解析，不做优化和规范化；所有格式统一的处理在 Finalization 阶段完成**。

---

## Finalization 阶段：拓扑与材质计算

### 核心入口与执行顺序

Finalization 入口是 `FinalizeModel(model, params)` 函数，位于 `source/engine/model/modelfinalization.js:237`。

```javascript
// 执行顺序
Finalize (model)
{
    this.Reset ();
    
    this.FinalizeMeshes (model);      // 1. 网格处理（拓扑计算核心）
    this.FinalizeMaterials (model);   // 2. 材质处理
    this.FinalizeNodes (model);       // 3. 节点树清理
}
```
**位置：** `modelfinalization.js:21-28`

### 1. 网格处理（拓扑计算核心）

#### 1.1 空网格过滤

```javascript
FinalizeMeshes (model)
{
    for (let meshIndex = 0; meshIndex < model.MeshCount (); meshIndex++) {
        let mesh = model.GetMesh (meshIndex);
        if (IsEmptyMesh (mesh)) {
            model.RemoveMesh (meshIndex);
            meshIndex = meshIndex - 1;  // 回退索引，处理数组变化
            continue;
        }
        this.FinalizeMesh (model, mesh);
    }
}
```
**位置：** `modelfinalization.js:56-67`

**空网格判定：** `IsEmptyMesh` 检查三角形和线条是否同时为空。

#### 1.2 法线计算的两种策略

Finalization 中最关键的拓扑计算是**自动法线生成**。代码中存在**两套完全不同的计算逻辑**：

| 场景 | 处理方式 | 位置 |
|------|---------|------|
| 普通三角形 (`curve === 0 \|\| null`) | 直接计算平面法线，三个顶点共享 | `FinalizeTriangle` |
| 曲线关联三角形 (`curve > 0`) | 同曲线相邻三角形平均法线，逐顶点计算 | `CalculateCurveNormals` |

**策略 1：普通三角形 - 平面法线**

```javascript
FinalizeTriangle (mesh, triangle, meshStatus)
{
    if (!triangle.HasNormals ()) {
        if (triangle.curve === null || triangle.curve === 0) {
            // 直接计算三角形平面法线
            let v0 = mesh.GetVertex (triangle.v0);
            let v1 = mesh.GetVertex (triangle.v1);
            let v2 = mesh.GetVertex (triangle.v2);
            let normal = CalculateTriangleNormal (v0, v1, v2);
            let normalIndex = mesh.AddNormal (normal);
            // 三个顶点共用同一个法线索引（硬边效果）
            triangle.SetNormals (normalIndex, normalIndex, normalIndex);
        } else {
            // 标记需要曲线法线计算
            meshStatus.calculateCurveNormals = true;
        }
    }
    // curve 为 null 时统一设为 0
    if (triangle.curve === null) {
        triangle.curve = 0;
    }
}
```
**位置：** `modelfinalization.js:162-180`

**策略 2：曲线三角形 - 平均法线**

当 `curve > 0` 时，需要在所有三角形处理完毕后，执行**延迟计算**：

```javascript
if (meshStatus.calculateCurveNormals) {
    CalculateCurveNormals (mesh);
}
```
**位置：** `modelfinalization.js:157-159`

`CalculateCurveNormals` 核心逻辑：

```javascript
CalculateCurveNormals (mesh)
{
    // 步骤 1: 预处理所有三角形的法线，并建立顶点->三角形映射
    let triangleNormals = [];
    let vertexToTriangles = new Map ();
    
    for (let triangleIndex = 0; triangleIndex < mesh.TriangleCount (); triangleIndex++) {
        let triangle = mesh.GetTriangle (triangleIndex);
        // 计算该三角形平面法线
        let normal = CalculateTriangleNormal (v0, v1, v2);
        triangleNormals.push (normal);
        // 建立顶点 -> 哪些三角形使用它的索引
        vertexToTriangles.get (triangle.v0).push (triangleIndex);
        vertexToTriangles.get (triangle.v1).push (triangleIndex);
        vertexToTriangles.get (triangle.v2).push (triangleIndex);
    }
    
    // 步骤 2: 对缺失法线的三角形，计算平滑法线
    for (let triangleIndex = 0; triangleIndex < mesh.TriangleCount (); triangleIndex++) {
        let triangle = mesh.GetTriangle (triangleIndex);
        if (!triangle.HasNormals ()) {
            // 为每个顶点找同 curve 组的相邻三角形，取平均法线
            let n0 = AddAverageNormal (mesh, triangle, triangle.v0, 
                                       triangleNormals, vertexToTriangles);
            let n1 = AddAverageNormal (mesh, triangle, triangle.v1, 
                                       triangleNormals, vertexToTriangles);
            let n2 = AddAverageNormal (mesh, triangle, triangle.v2, 
                                       triangleNormals, vertexToTriangles);
            triangle.SetNormals (n0, n1, n2);
        }
    }
}
```
**位置：** `modelfinalization.js:71-136`

**平均法线计算函数：**

```javascript
AddAverageNormal (mesh, triangle, vertexIndex, triangleNormals, vertexToTriangles)
{
    let averageNormals = [];
    let neigTriangles = vertexToTriangles.get (vertexIndex);
    
    for (let i = 0; i < neigTriangles.length; i++) {
        let neigIndex = neigTriangles[i];
        let neigTriangle = mesh.GetTriangle (neigIndex);
        
        // 关键：只平均同属一个 curve 组的三角形
        if (triangle.curve === neigTriangle.curve) {
            let triangleNormal = triangleNormals[neigIndex];
            // 去重：防止重复法线影响平均结果
            if (!IsNormalInArray (averageNormals, triangleNormal)) {
                averageNormals.push (triangleNormal);
            }
        }
    }
    
    // 简单算术平均后归一化
    let averageNormal = new Coord3D (0.0, 0.0, 0.0);
    for (let i = 0; i < averageNormals.length; i++) {
        averageNormal = AddCoord3D (averageNormal, averageNormals[i]);
    }
    averageNormal.MultiplyScalar (1.0 / averageNormals.length);
    averageNormal.Normalize ();
    
    return mesh.AddNormal (averageNormal);
}
```
**位置：** `modelfinalization.js:73-106`

#### 1.3 curve 分组的设计意义

`curve` 字段本质上是一个**平滑组 ID**：

- `curve = 0`：不需要平滑，每个三角形使用自己的平面法线（硬边）
- `curve > 0`：同 ID 的三角形在共享顶点处进行法线平均（平滑边）

这种设计允许在同一个 mesh 内存在**多个不连续的平滑区域**，是 CAD 模型常见需求。

### 2. 材质处理

#### 2.1 顶点颜色材质标记

```javascript
FinalizeMaterials (model)
{
    if (model.VertexColorCount () === 0) {
        return;  // 无顶点颜色则跳过
    }
    
    // 遍历所有三角形，统计哪些材质关联了顶点颜色
    let materialHasVertexColors = new Map ();
    for (let meshIndex = 0; meshIndex < model.MeshCount (); meshIndex++) {
        let mesh = model.GetMesh (meshIndex);
        for (let triangleIndex = 0; triangleIndex < mesh.TriangleCount (); triangleIndex++) {
            let triangle = mesh.GetTriangle (triangleIndex);
            let hasVertexColors = triangle.HasVertexColors ();
            
            if (!materialHasVertexColors.has (triangle.mat)) {
                materialHasVertexColors.set (triangle.mat, hasVertexColors);
            } else if (!hasVertexColors) {
                // 关键点：一个材质只要有一个三角形没有顶点颜色
                // 整个材质就标记为无顶点颜色（保守策略）
                materialHasVertexColors.set (triangle.mat, false);
            }
        }
    }
    
    // 更新材质的 vertexColors 标记
    for (let [materialIndex, hasVertexColors] of materialHasVertexColors) {
        let material = model.GetMaterial (materialIndex);
        material.vertexColors = hasVertexColors;
    }
}
```
**位置：** `modelfinalization.js:30-54`

#### 2.2 默认材质自动分配

对于没有指定材质的线条和面，在 `FinalizeMesh` 中分配：

```javascript
// 线条材质
for (let i = 0; i < mesh.LineCount (); i++) {
    let line = mesh.GetLine (i);
    if (line.mat === null) {
        line.mat = this.GetDefaultMaterialIndex (model, MaterialSource.DefaultLine);
    }
}

// 三角面材质
for (let i = 0; i < mesh.TriangleCount (); i++) {
    let triangle = mesh.GetTriangle (i);
    this.FinalizeTriangle (mesh, triangle, meshStatus);
    if (triangle.mat === null) {
        triangle.mat = this.GetDefaultMaterialIndex (model, MaterialSource.DefaultFace);
    }
}
```
**位置：** `modelfinalization.js:142-155`

默认材质创建采用**懒加载单例**模式：

```javascript
GetDefaultMaterialIndex (model, source)
{
    function GetIndex (model, index, source, color)
    {
        if (index !== null) {
            return index;  // 已创建则直接返回
        }
        let defaultMaterial = new PhongMaterial ();
        defaultMaterial.color = color;
        defaultMaterial.source = source;  // 标记来源：DefaultLine/DefaultFace
        return model.AddMaterial (defaultMaterial);
    }
    
    // 整个模型共享默认材质
    if (source === MaterialSource.DefaultLine) {
        this.defaultLineMaterialIndex = GetIndex (...);
        return this.defaultLineMaterialIndex;
    } else if (source === MaterialSource.DefaultFace) {
        this.defaultMaterialIndex = GetIndex (...);
        return this.defaultMaterialIndex;
    }
}
```
**位置：** `modelfinalization.js:206-228`

### 3. 节点树清理

```javascript
FinalizeNodes (model)
{
    let rootNode = model.GetRootNode ();
    
    // 收集所有空节点
    let emptyNodes = [];
    rootNode.EnumerateChildren ((node) => {
        if (node.IsEmpty ()) {
            emptyNodes.push (node);
        }
    });
    
    // 从树中移除，注意：父节点变空后也加入待删列表
    for (let nodeIndex = 0; nodeIndex < emptyNodes.length; nodeIndex++) {
        let node = emptyNodes[nodeIndex];
        let parentNode = node.GetParent ();
        if (parentNode === null) {
            continue;
        }
        parentNode.RemoveChildNode (node);
        if (parentNode.IsEmpty ()) {
            emptyNodes.push (parentNode);  // 级联检查
        }
    }
}
```
**位置：** `modelfinalization.js:182-204`

**空节点定义：** `childNodes.length === 0 && meshIndices.length === 0`

---

## Three.js 转换器：几何与材质缓存

### 整体转换架构

转换入口是 `ConvertModelToThreeObject` 函数，位于 `source/engine/threejs/threeconverter.js:327`。

```
┌────────────────────────────────────────────────────────────────────────┐
│                      转换过程数据流                                      │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│   ┌──────────────┐                                                     │
│   │ Model (OV)   │                                                     │
│   └──────┬───────┘                                                     │
│          │                                                             │
│          ▼                                                             │
│   ┌──────────────────────────────────────────────────────────────┐  │
│   │              ConvertModelToThreeObject                        │  │
│   │                                                                │  │
│   │  ┌─────────────────┐    ┌─────────────────────────────────┐ │  │
│   │  │ThreeNodeTree    │    │  ThreeMaterialHandler            │ │  │
│   │  │(节点树+变换)     │    │  - 材质缓存 Map                  │ │  │
│   │  │                 │    │  - 纹理异步加载                   │ │  │
│   │  │ 遍历所有 Mesh    │    │  - 输出默认材质列表               │ │  │
│   │  │ 实例构建 Three   │    │                                 │ │  │
│   │  └────────┬────────┘    └───────────────┬─────────────────┘ │  │
│   │           │                              │                     │  │
│   │           ▼                              ▼                     │  │
│   │  ┌─────────────────────────────────────────────────────────┐ │  │
│   │  │           ConvertMesh (逐个 MeshInstance)                │ │  │
│   │  │                                                           │ │  │
│   │  │  ┌──────────────────┐    ┌─────────────────────┐       │ │  │
│   │  │  │ CreateThree-     │    │ CreateThree-        │       │ │  │
│   │  │  │ TriangleMesh     │    │ LineMesh            │       │ │  │
│   │  │  │                  │    │                     │       │ │  │
│   │  │  │ 1. 按材质排序    │    │ 1. 按材质排序       │       │ │  │
│   │  │  │ 2. 展开顶点数据  │    │ 2. 展开顶点数据     │       │ │  │
│   │  │  │ 3. ThreeMesh-   │    │ 3. ThreeMesh-      │       │ │  │
│   │  │  │    MaterialHandler │    │   MaterialHandler  │       │ │  │
│   │  │  │    分组渲染      │    │    分组渲染         │       │ │  │
│   │  │  └────────┬─────────┘    └──────────┬──────────┘       │ │  │
│   │  └───────────┼──────────────────────────┼───────────────────┘ │  │
│   └──────────────┼──────────────────────────┼──────────────────────┘  │
│                  ▼                          ▼                         │
│         ┌────────────────────────────────────────────────────┐       │
│         │            THREE.Object3D (场景树)                  │       │
│         │  - 保持层级结构                                      │       │
│         │  - 每个 Mesh 含 userData 回指内部模型               │       │
│         └────────────────────────────────────────────────────┘       │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### 1. 材质缓存机制

#### 1.1 核心缓存结构

`ThreeMaterialHandler` 使用 **JavaScript Map** 实现 OV 材质索引到 Three.js 材质对象的缓存：

```javascript
export class ThreeMaterialHandler
{
    constructor (model, stateHandler, conversionParams, conversionOutput)
    {
        this.model = model;
        // ...
        
        // 两套独立缓存：面材质 vs 线材质
        this.modelToThreeLineMaterial = new Map ();  // key: number (index)
        this.modelToThreeMaterial = new Map ();       // key: number (index)
    }
    
    GetThreeMaterial (modelMaterialIndex, geometryType)
    {
        if (geometryType === MaterialGeometryType.Face) {
            // 命中缓存则直接返回
            if (!this.modelToThreeMaterial.has (modelMaterialIndex)) {
                // 未命中：创建并放入缓存
                let threeMaterial = this.CreateThreeFaceMaterial (modelMaterialIndex);
                this.modelToThreeMaterial.set (modelMaterialIndex, threeMaterial);
            }
            return this.modelToThreeMaterial.get (modelMaterialIndex);
        } else if (geometryType === MaterialGeometryType.Line) {
            // 线材质同理
            if (!this.modelToThreeLineMaterial.has (modelMaterialIndex)) {
                let threeMaterial = this.CreateThreeLineMaterial (modelMaterialIndex);
                this.modelToThreeLineMaterial.set (modelMaterialIndex, threeMaterial);
            }
            return this.modelToThreeLineMaterial.get (modelMaterialIndex);
        }
    }
    // ...
}
```
**位置：** `threeconverter.js:106-137`

**缓存设计要点：**

| 特性 | 说明 |
|------|------|
| 作用域 | 单次转换会话内有效（与 ThreeMaterialHandler 同生命周期） |
| 键类型 | OV 内部材质索引（number），简洁高效 |
| 分离缓存 | 面和线使用不同 Map，因为材质类型完全不同 |
| 懒加载 | `GetThreeMaterial` 时才实际创建，按需分配 |

#### 1.2 材质创建策略

根据模型材质类型选择 Three.js 材质类型：

```javascript
CreateThreeFaceMaterial (materialIndex)
{
    let material = this.model.GetMaterial (materialIndex);
    let baseColor = ConvertColorToThreeColor (material.color);
    
    let materialParams = {
        color : baseColor,
        vertexColors : material.vertexColors,  // 来自 Finalization 的标记
        opacity : material.opacity,
        transparent : material.transparent,
        alphaTest : material.alphaTest,
        side : THREE.DoubleSide
    };
    
    // 整体材质类型由模型首个带类型的材质决定
    if (this.shadingType === ShadingType.Phong) {
        threeMaterial = new THREE.MeshPhongMaterial (materialParams);
        // ... 设置 specular, shininess, specularMap
    } else if (this.shadingType === ShadingType.Physical) {
        threeMaterial = new THREE.MeshStandardMaterial (materialParams);
        // ... 设置 metalness, roughness, metalnessMap
    }
    
    // 纹理异步加载（见下节）
    this.LoadFaceTexture (threeMaterial, material.diffuseMap, ...);
    this.LoadFaceTexture (threeMaterial, material.bumpMap, ...);
    // ...
    
    // 默认材质追踪（供后续替换颜色）
    if (material.source !== MaterialSource.Model) {
        threeMaterial.userData.source = material.source;
        this.conversionOutput.defaultMaterials.push (threeMaterial);
    }
    
    return threeMaterial;
}
```
**位置：** `threeconverter.js:139-213`

### 2. 纹理异步加载与状态同步

纹理加载是异步过程，需要特殊的状态协调机制：

```javascript
export class ThreeConversionStateHandler
{
    constructor (callbacks)
    {
        this.callbacks = callbacks;
        this.texturesNeeded = 0;   // 需要加载的总数
        this.texturesLoaded = 0;   // 已完成数量
        this.threeObject = null;
    }
    
    OnTextureNeeded ()
    {
        this.texturesNeeded += 1;
    }
    
    OnTextureLoaded ()
    {
        this.texturesLoaded += 1;
        this.callbacks.onTextureLoaded ();  // 进度回调
        this.Finish ();
    }
    
    OnModelLoaded (threeObject)
    {
        this.threeObject = threeObject;
        this.Finish ();
    }
    
    Finish ()
    {
        // 双条件：几何+节点转换完成 && 所有纹理加载完成
        if (this.threeObject !== null && this.texturesNeeded === this.texturesLoaded) {
            this.callbacks.onModelLoaded (this.threeObject);
        }
    }
}
```
**位置：** `threeconverter.js:34-68`

纹理加载触发点：

```javascript
LoadFaceTexture (threeMaterial, texture, onTextureLoaded)
{
    if (texture === null || !texture.IsValid ()) {
        return;
    }
    
    let loader = new THREE.TextureLoader ();
    this.stateHandler.OnTextureNeeded ();  // 计数+1
    
    // 将 ArrayBuffer 转为 ObjectUrl 供 THREE.TextureLoader 使用
    let textureObjectUrl = CreateObjectUrlWithMimeType (texture.buffer, texture.mimeType);
    this.conversionOutput.objectUrls.push (textureObjectUrl);  // 追踪以便释放
    
    loader.load (textureObjectUrl,
        (threeTexture) => {
            SetTextureParameters (texture, threeTexture);
            threeMaterial.needsUpdate = true;
            onTextureLoaded (threeTexture);
            this.stateHandler.OnTextureLoaded ();  // 完成计数+1，触发可能的 Finish
        },
        null,
        (err) => {
            this.stateHandler.OnTextureLoaded ();  // 失败也算"完成"
        }
    );
}
```
**位置：** `threeconverter.js:237-274`

**生命周期管理：** 这些 `objectUrls` 由 `ThreeModelLoader` 追踪，在下次加载或销毁时通过 `RevokeObjectUrls` 释放。

### 3. 几何数据处理与多材质分组

当一个 Mesh 包含多个不同材质的三角形时，需要使用 Three.js 的 **Geometry Groups** 机制实现单 Geometry 多材质渲染。

#### 3.1 按材质排序

```javascript
CreateThreeTriangleMesh (meshInstance, materialHandler)
{
    let mesh = meshInstance.mesh;
    let triangleCount = mesh.TriangleCount ();
    
    // 关键点：按材质索引排序
    // 这样相同材质的三角形在数组中连续，便于分组
    let triangleIndices = [];
    for (let i = 0; i < triangleCount; i++) {
        triangleIndices.push (i);
    }
    triangleIndices.sort ((a, b) => {
        let aTriangle = mesh.GetTriangle (a);
        let bTriangle = mesh.GetTriangle (b);
        return aTriangle.mat - bTriangle.mat;
    });
    
    let threeGeometry = new THREE.BufferGeometry ();
    let meshMaterialHandler = new ThreeMeshMaterialHandler (
        threeGeometry, 
        MaterialGeometryType.Face, 
        materialHandler
    );
    
    // ... 遍历排序后的三角形，填充顶点数据
}
```
**位置：** `threeconverter.js:329-420`

#### 3.2 ThreeMeshMaterialHandler 分组机制

```javascript
export class ThreeMeshMaterialHandler
{
    constructor (threeGeometry, geometryType, materialHandler)
    {
        this.threeGeometry = threeGeometry;
        this.geometryType = geometryType;
        this.materialHandler = materialHandler;
        
        this.itemVertexCount = (geometryType === MaterialGeometryType.Face) ? 3 : 2;
        
        // 两组材质数组：Three.js 材质 + 原始索引（用于同步）
        this.meshThreeMaterials = [];
        this.meshOriginalMaterials = [];
        
        this.groupStart = null;
        this.previousMaterialIndex = null;
    }
    
    ProcessItem (itemIndex, materialIndex)
    {
        if (this.previousMaterialIndex !== materialIndex) {
            // 材质变化：关闭上一个 group（如果有）
            if (this.groupStart !== null) {
                this.AddGroup (this.groupStart, itemIndex - 1);
            }
            
            // 开启新 group
            this.groupStart = itemIndex;
            
            // 从缓存获取 Three.js 材质（利用前面的缓存机制）
            let threeMaterial = this.materialHandler.GetThreeMaterial (
                materialIndex, this.geometryType
            );
            this.meshThreeMaterials.push (threeMaterial);
            this.meshOriginalMaterials.push (materialIndex);
            
            this.previousMaterialIndex = materialIndex;
        }
    }
    
    Finalize (itemCount)
    {
        this.AddGroup (this.groupStart, itemCount - 1);
    }
    
    AddGroup (start, end)
    {
        // materialIndex 指向 meshThreeMaterials 数组的索引
        let materialIndex = this.meshThreeMaterials.length - 1;
        
        // THREE.BufferGeometry.addGroup(start, count, materialIndex)
        this.threeGeometry.addGroup (
            start * this.itemVertexCount, 
            (end - start + 1) * this.itemVertexCount, 
            materialIndex
        );
    }
}
```
**位置：** `threeconverter.js:277-325`

最终 THREE.Mesh 的构建：

```javascript
let threeMesh = new THREE.Mesh (threeGeometry, meshMaterialHandler.meshThreeMaterials);
threeMesh.name = mesh.GetName ();
threeMesh.userData = {
    originalMeshInstance : meshInstance,      // 回指 OV 内部模型
    originalMaterials : meshMaterialHandler.meshOriginalMaterials,  // 原始材质索引
    threeMaterials : null  // 用于高亮状态时保存原材质
};
```
**位置：** `threeconverter.js:411-417`

---

## Viewer 层：生命周期管理与选中状态同步

### 1. 核心类层次

```
┌────────────────────────────────────────────────────────────────────────┐
│                         Viewer 类层次                                    │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                         Viewer                                   │  │
│  │  (主控制器：渲染循环、导航、交互、高亮)                          │  │
│  │                                                                  │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐ │  │
│  │  │ ViewerMain-  │  │  Navigation  │  │    ShadingModel     │ │  │
│  │  │ Model        │  │              │  │                     │ │  │
│  │  │              │  │ - 相机控制   │  │ - 光照/环境         │ │  │
│  │  │ 含两个      │  │ - 鼠标交互   │  │ - 材质类型切换       │ │  │
│  │  │ ViewerModel  │  │              │  │                     │ │  │
│  │  └──────┬───────┘  └──────────────┘  └─────────────────────┘ │  │
│  │         │                                                         │  │
│  │         ▼                                                         │  │
│  │  ┌──────────────────────────────────────────────────────────┐  │  │
│  │  │                    ViewerModel                             │  │  │
│  │  │  (单个模型容器：rootObject + 场景挂载)                    │  │  │
│  │  │                                                             │  │  │
│  │  │  - rootObject: THREE.Object3D (转换结果)                  │  │  │
│  │  │  - scene.add(rootObject) / scene.remove(rootObject)      │  │  │
│  │  │  - Traverse() 遍历子对象                                   │  │  │
│  │  │  - Clear() 时 DisposeThreeObjects 释放资源                │  │  │
│  │  └──────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### 2. 生命周期管理

#### 2.1 初始化

```javascript
Init (canvas)
{
    this.canvas = canvas;
    
    // 渲染器
    let parameters = { canvas : this.canvas, antialias : true };
    this.renderer = new THREE.WebGLRenderer (parameters);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setClearColor ('#ffffff', 1.0);
    
    // 场景
    this.scene = new THREE.Scene ();
    
    // 模型容器
    this.mainModel = new ViewerMainModel (this.scene);
    this.extraModel = new ViewerModel (this.scene);
    
    // 导航系统
    this.InitNavigation ();
    
    // 着色系统
    this.InitShading ();
    
    this.Render ();
}
```
**位置：** `viewer.js:180-207`

#### 2.2 模型设置与替换

```javascript
SetMainObject (object)
{
    // 先判断材质类型（Phong vs Physical）
    const shadingType = GetShadingTypeOfObject (object);
    
    // ViewerMainModel.SetMainObject 内部会先 Clear 旧模型
    this.mainModel.SetMainObject (object);
    
    // 更新光照以匹配材质类型
    this.shadingModel.SetShadingType (shadingType);
    
    this.Render ();
}
```
**位置：** `viewer.js:421-428`

`ViewerMainModel.SetMainObject` 实现：

```javascript
SetMainObject (mainObject)
{
    // 内部先清理
    this.mainModel.SetRootObject (mainObject);
    this.hasLines = false;
    this.hasPolygonOffset = false;
    
    // 检测是否含线条
    this.EnumerateLines ((line) => {
        this.hasLines = true;
    });
    
    // 根据设置生成边缘线模型
    if (this.edgeSettings.showEdges) {
        this.GenerateEdgeModel ();
    }
    this.UpdatePolygonOffset ();
}
```
**位置：** `viewermodel.js:134-148`

#### 2.3 清理与销毁

```javascript
// 清理模型但保留 Viewer
Clear ()
{
    this.mainModel.Clear ();
    this.extraModel.Clear ();
    this.Render ();
}

// 完全销毁
Destroy ()
{
    this.Clear ();
    this.renderer.dispose ();
}
```
**位置：** `viewer.js:436-441, 596-600`

资源释放的核心是 `DisposeThreeObjects`（在 `threeutils.js` 中），它会递归释放：
- `geometry.dispose()`
- `material.dispose()`
- 纹理 `dispose()`

### 3. 边缘显示与 PolygonOffset

ViewerMainModel 维护**两个独立的 ViewerModel**：

```javascript
this.mainModel = new ViewerModel (this.scene);  // 主体模型
this.edgeModel = new ViewerModel (this.scene);  // 边缘线
```
**位置：** `viewermodel.js:126-127`

边缘线生成：

```javascript
GenerateEdgeModel ()
{
    let edgeColor = ConvertColorToThreeColor (this.edgeSettings.edgeColor);
    
    this.UpdateWorldMatrix ();
    this.EnumerateMeshes ((mesh) => {
        // 使用 THREE.EdgesGeometry 提取轮廓
        let edges = new THREE.EdgesGeometry (mesh.geometry, this.edgeSettings.edgeThreshold);
        let line = new THREE.LineSegments (edges, new THREE.LineBasicMaterial ({
            color: edgeColor
        }));
        line.applyMatrix4 (mesh.matrixWorld);
        line.userData = mesh.userData;  // 共享 userData，保持选中同步
        line.visible = mesh.visible;
        this.edgeModel.AddObject (line);
    });
    
    this.UpdatePolygonOffset ();
}
```
**位置：** `viewermodel.js:184-201`

**PolygonOffset 策略：** 当场景中有线条或边缘线时，需要让面稍微"后退"以避免 Z-fighting：

```javascript
UpdatePolygonOffset ()
{
    let needPolygonOffset = this.HasLinesOrEdges ();
    if (needPolygonOffset !== this.hasPolygonOffset) {
        this.EnumerateMeshes ((mesh) => {
            SetThreeMeshPolygonOffset (mesh, needPolygonOffset);
        });
        this.hasPolygonOffset = needPolygonOffset;
    }
}
```
**位置：** `viewermodel.js:290-299`

### 4. 选中状态同步：userData 双向映射

#### 4.1 userData 结构

在 Three.js 转换阶段，每个 THREE.Mesh/Lines 都被附加了 userData：

```javascript
threeMesh.userData = {
    originalMeshInstance : meshInstance,  // OV 内部 MeshInstance
    originalMaterials : [...],            // 原始材质索引数组
    threeMaterials : null                  // 高亮时保存原材质引用
};
```
**位置：** `threeconverter.js:413-417`

`MeshInstance` 是 OV 内部的关键概念：

```javascript
export class MeshInstanceId
{
    constructor (nodeId, meshIndex)
    {
        this.nodeId = nodeId;      // 场景图节点 ID
        this.meshIndex = meshIndex; // 该节点引用的 mesh 索引
    }
}

export class MeshInstance
{
    constructor (id, node, mesh)
    {
        this.id = id;
        this.node = node;
        this.mesh = mesh;
    }
    // ...
}
```
**位置：** `meshinstance.js`（逻辑来自 main.js 导出）

**设计意图：** 同一个 Mesh 可以被多个 Node 引用（实例化），`MeshInstanceId` 唯一标识一个具体的使用位置。

#### 4.2 高亮实现机制

```javascript
SetMeshesHighlight (highlightColor, isHighlighted)
{
    let withPolygonOffset = this.mainModel.HasLinesOrEdges ();
    
    this.mainModel.EnumerateMeshesAndLines ((mesh) => {
        let highlighted = isHighlighted (mesh.userData);  // 通过 userData 判断
        
        if (highlighted) {
            if (mesh.userData.threeMaterials === null) {
                // 步骤 1：保存当前材质引用
                mesh.userData.threeMaterials = mesh.material;
                // 步骤 2：替换为高亮材质（带颜色）
                mesh.material = CreateHighlightMaterials (
                    mesh.userData.threeMaterials, 
                    highlightColor, 
                    withPolygonOffset
                );
            }
        } else {
            if (mesh.userData.threeMaterials !== null) {
                // 恢复原始材质
                mesh.material = mesh.userData.threeMaterials;
                mesh.userData.threeMaterials = null;
            }
        }
    });
    
    this.Render ();
}
```
**位置：** `viewer.js:466-485`

**状态流转：**

| 状态 | `mesh.material` | `mesh.userData.threeMaterials` |
|------|-----------------|---------------------------------|
| 正常 | 原始材质数组 | `null` |
| 高亮 | 高亮材质数组 | 原始材质数组（保存） |
| 恢复 | 原始材质数组 | `null` |

#### 4.3 可见性同步

```javascript
SetMeshesVisibility (isVisible)
{
    // 主体模型
    this.mainModel.EnumerateMeshesAndLines ((mesh) => {
        let visible = isVisible (mesh.userData);
        if (mesh.visible !== visible) {
            mesh.visible = visible;
        }
    });
    
    // 边缘模型也要同步（注意边缘线共享 userData）
    this.mainModel.EnumerateEdges ((edge) => {
        let visible = isVisible (edge.userData);
        if (edge.visible !== visible) {
            edge.visible = visible;
        }
    });
    
    this.Render ();
}
```
**位置：** `viewer.js:449-464`

#### 4.4 鼠标拾取

```javascript
GetMeshIntersectionUnderMouse (intersectionMode, mouseCoords)
{
    let canvasSize = this.GetCanvasSize ();
    let intersection = this.mainModel.GetMeshIntersectionUnderMouse (
        intersectionMode, mouseCoords, this.camera, 
        canvasSize.width, canvasSize.height
    );
    if (intersection === null) {
        return null;
    }
    return intersection;  // intersection.object.userData 即可获取原始信息
}
```
**位置：** `viewer.js:496-504`

底层使用 `THREE.Raycaster`：

```javascript
GetMeshIntersectionUnderMouse (intersectionMode, mouseCoords, camera, width, height)
{
    // 归一化设备坐标
    let mousePos = new THREE.Vector2 ();
    mousePos.x = (mouseCoords.x / width) * 2 - 1;
    mousePos.y = -(mouseCoords.y / height) * 2 + 1;
    
    let raycaster = new THREE.Raycaster ();
    raycaster.setFromCamera (mousePos, camera);
    raycaster.params.Line.threshold = 10.0;  // 线拾取容差
    
    let iSectObjects = raycaster.intersectObject (
        this.mainModel.GetRootObject (), true
    );
    
    // 筛选可见物体
    for (let i = 0; i < iSectObjects.length; i++) {
        let iSectObject = iSectObjects[i];
        if (!iSectObject.object.visible) {
            continue;
        }
        // ... MeshOnly / MeshAndLine 模式判断
        return iSectObject;
    }
    return null;
}
```
**位置：** `viewermodel.js:301-340`

---

## 独立内部模型层：设计原则与实际好处

### 1. 架构对比

#### 传统设计（无独立模型层）

```
格式A ──┐
格式B ──┼──▶ 直接构建 THREE.Object3D ──▶ 渲染
格式C ──┘
        (每种格式都要处理 Three.js 细节)
```

**问题：**
- 每种 importer 都要处理 Three.js 特定逻辑
- 不同格式的 common 处理难以复用
- 无法在渲染前做统一的模型分析和优化
- 导出功能需要再次理解每种格式的结构

#### Online3DViewer 设计

```
        ┌─────────────────────────────────────────────────────────┐
        │                  Internal Model Layer                    │
        │  (Model, Mesh, Node, Material, Topology, 与渲染无关)    │
        └───────────────────────┬─────────────────────────────────┘
                                │
           ┌────────────────────┴────────────────────┐
           │                                         │
           ▼                                         ▼
    ┌──────────────┐                         ┌──────────────┐
    │  Importers   │                         │  Exporters   │
    │  (20+格式)   │                         │  (多种格式)   │
    └──────────────┘                         └──────────────┘
           │                                         │
           ▼                                         ▼
    ┌─────────────────────────────────────────────────────────┐
    │                    ThreeConverter                        │
    │         (可选转换：内部模型 ──▶ THREE.Object3D)          │
    └─────────────────────────────────────────────────────────┘
```

### 2. 分层结构详解

#### 2.1 核心模型类

| 类 | 职责 | 关键特征 |
|---|------|---------|
| `Model` | 顶级容器 | unit + rootNode + materials[] + meshes[] |
| `Node` | 场景图节点 | 层级结构 + 变换矩阵 + meshIndices[] 引用 |
| `Mesh` | 几何数据 | 顶点/法线/UV + triangles[] + lines[] |
| `MaterialBase` | 材质基础 | 颜色 + opacity + 多种纹理槽 |
| `Topology` | 拓扑分析 | 顶点-边-三角形邻接关系（按需构建） |

#### 2.2 数据复用机制

```
一个 Mesh 可被多个 Node 引用（实例化）

Mesh (索引=0)                 Node (id=0)
├── vertices: [...]            ├── transformation: Matrix
├── normals: [...]             └── meshIndices: [0, 2]
├── triangles: [...]
                               Node (id=1)
Mesh (索引=1)                 ├── transformation: Matrix
├── vertices: [...]            └── meshIndices: [0, 1]  ← 复用 mesh 0
└── ...
                                   
Mesh (索引=2)
└── ...
```

在代码中体现为：

```javascript
// Node 只存索引，不存 Mesh 对象
this.meshIndices = [];  // 数组元素是 number

// 获取 MeshInstance 时才组合
GetMeshInstance (instanceId)  // instanceId = {nodeId, meshIndex}
{
    // 1. 根据 nodeId 找 Node
    // 2. 根据 meshIndex 从 model.meshes 取 Mesh
    // 3. 组合成 MeshInstance 返回
}
```
**位置：** `model.js:167-185`

### 3. 实际好处分析

#### 好处 1：Importer 职责单一化，降低格式支持成本

**现状：**
- `modelfinalization.js` 承担所有格式的规范化
- Importer 只需"填数据"，无需考虑渲染

**看一个典型 Importer（以 STL 为例）的逻辑：**

```
ImporterStl 只做：
  1. 解析二进制/ASCII STL 格式
  2. 创建 Mesh
  3. 添加三角面（如果文件有法线则保留，没有就留空）
  4. AddMeshToRootNode

不做：
  - 法线计算（finalization 做）
  - 材质分配（finalization 做）
  - 任何 Three.js 相关逻辑
```

**收益：** 支持新格式时，只需关注格式解析本身，Finalization 可复用。

#### 好处 2：统一优化与分析点

Finalization 作为独立阶段，可以做：

| 功能 | 位置 | 价值 |
|------|------|------|
| 自动法线计算 | `modelfinalization.js` | 多种格式可能缺失法线 |
| 平滑组（curve）处理 | `modelfinalization.js` | CAD 模型常见需求 |
| 默认材质分配 | `modelfinalization.js` | 统一兜底策略 |
| 空节点/空网格清理 | `modelfinalization.js` | 优化场景图大小 |
| 流形检测 | `modelutils.js` | 用于 3D 打印预处理判断 |
| 体积/表面积计算 | `quantities.js` | 基于内部模型，与渲染无关 |
| 拓扑邻接分析 | `topology.js` | 用于高级选择、编辑操作 |

**关键点：** 这些功能如果耦合在 Three.js 场景树上，实现会非常困难且低效。

#### 好处 3：对称的导入导出架构

```
┌────────────────────────────────────────────────────────────────┐
│                      导入导出对称                                │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│   STL/OBJ/... ──Importer──▶ Internal Model ──Exporter──▶ STL │
│                                                                │
│   同一模型表示可以：                                            │
│   - 渲染（经 ThreeConverter）                                  │
│   - 导出为其他格式                                              │
│   - 做几何分析（体积、拓扑、流形）                              │
│   - 程序修改（参数化调整）                                      │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

看 `exporterobj.js` 等导出器的实现：它们直接读取 Model/Mesh/Material，不依赖 Three.js。

#### 好处 4：缓存与状态管理更清晰

转换阶段的缓存：
- 材质缓存 Map 的键是内部索引（简单数字）
- 如果直接在 Three.js 对象上做缓存，需要处理复杂的对象引用

Viewer 层的状态同步：
- `userData.originalMeshInstance` 提供明确的"双向指针"
- 高亮、可见性等操作通过回调 `isHighlighted(mesh.userData)` 实现
- 业务逻辑（选中哪些）与渲染逻辑（如何高亮）分离

#### 好处 5：测试友好

内部模型是 Plain Old JavaScript Objects，测试时：

```javascript
// 不需要创建 WebGL 环境即可测试
let model = new Model ();
let mesh = new Mesh ();
mesh.AddVertex (new Coord3D (0, 0, 0));
// ...

FinalizeModel (model, params);

// 直接断言结果
assert.strictEqual (mesh.NormalCount (), expected);
```

测试文件位置：`test/tests/` 下的 `model_test.js`、`mesh_test.js`、`topology_test.js` 等都不依赖浏览器或 WebGL。

#### 好处 6：渲染引擎可替换（理论上）

虽然目前只实现了 Three.js 转换器，但架构上：

```
Internal Model ──┬──▶ ThreeConverter ──▶ THREE.Object3D
                 │
                 └──▶ [可扩展] BabylonConverter ──▶ Babylon.js
                 │
                 └──▶ [可扩展] Export to STL/OBJ/GLTF/...
```

内部模型层定义了"什么是 3D 模型"，转换层只是不同的序列化/适配方式。

### 4. 设计权衡

任何架构选择都有代价：

| 代价 | 说明 | 缓解措施 |
|------|------|---------|
| 内存占用 | 内部模型 + Three.js 模型两份表示 | 大型场景下可考虑延迟转换或流式处理（当前未实现） |
| 转换开销 | Finalization + ThreeConverter 两次遍历 | 批处理（`RunTasksBatch`）缓解 UI 阻塞 |
| 实现复杂度 | 需要维护两套模型语义映射 | userData 回指机制 + 明确的 MeshInstance 概念 |
| 功能滞后 | Three.js 新特性需要先映射到内部模型 | 内部模型设计时保持扩展性（如 PhysicalMaterial 后加） |

---

## 总结

### 核心设计模式提炼

1. **Pipeline 模式（Finalization）**：将数据规范化拆分为独立阶段，每个阶段职责单一
2. **Cache 模式（ThreeMaterialHandler）**：通过 Map 缓存材质对象，避免重复创建
3. **Adapter 模式（ThreeConverter）**：将内部模型适配为 Three.js 场景树
4. **Memento 模式（userData.threeMaterials）**：高亮时保存原始状态，事后恢复
5. **Layered Architecture**：Importer → Internal Model → Converter → Viewer 清晰分层

### 关键数据流公式

```
最终渲染 = 
  格式解析(Importer) 
  + 规范化(Finalization: 法线+材质+节点清理) 
  + 转换(ThreeConverter: 几何展开+材质缓存+纹理加载) 
  + 同步(Viewer: userData回指 + 材质切换)
```

### 最值得借鉴的设计

1. **Finalization 中 curve 分组法线算法**：展示了如何处理 CAD 模型中的平滑需求
2. **材质索引 + userData 同步**：简单高效的跨层状态管理方案
3. **独立内部模型层**：为多格式支持、分析、导出、测试提供统一基础
