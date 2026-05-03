# Online3DViewer 模型 Finalization、Three.js 转换与 Viewer 架构分析

## 目录
1. [整体数据流转概述](#整体数据流转概述)
2. [Finalization 阶段：拓扑与材质计算](#finalization-阶段拓扑与材质计算)
3. [Three.js 转换器：几何与材质缓存的边界](#threejs-转换器几何与材质缓存的边界)
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

## Three.js 转换器：几何与材质缓存的边界

### 整体转换架构

转换入口是 `ConvertModelToThreeObject` 函数，位于 `source/engine/threejs/threeconverter.js:327`。

### 1. 核心概念：MeshInstanceId 与实例展开

在理解几何和材质缓存之前，必须先理解 OV 的**实例化机制**。

#### 1.1 MeshInstanceId：实例的唯一标识

```javascript
export class MeshInstanceId
{
    constructor (nodeId, meshIndex)
    {
        this.nodeId = nodeId;      // 场景图节点 ID（整数）
        this.meshIndex = meshIndex; // 该节点引用的 mesh 索引（整数）
    }
    
    IsEqual (rhs)
    {
        return this.nodeId === rhs.nodeId && this.meshIndex === rhs.meshIndex;
    }
    
    GetKey ()
    {
        return this.nodeId.toString () + ':' + this.meshIndex.toString ();
    }
}
```
**位置：** `meshinstance.js:4-21`

**设计意图：**
- 同一个 `Mesh`（几何数据）可以被多个 `Node` 引用
- `MeshInstanceId = (nodeId, meshIndex)` 唯一标识一个**具体的使用位置**
- 这是 OV 实现"实例化"的方式：数据共享，引用独立

#### 1.2 内部模型层的数据复用关系

```
┌────────────────────────────────────────────────────────────────────────┐
│                    内部模型层的数据复用关系                               │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│   Model                                                                │
│   ├── materials[]  ──────────────────────────────────────┐            │
│   │                                                        │            │
│   ├── meshes[]                                            │            │
│   │   ├── Mesh[0] (顶点+法线+三角形数据)                   │            │
│   │   ├── Mesh[1]                                         │            │
│   │   └── Mesh[2]                                         │            │
│   │                                                        │            │
│   └── rootNode                                            │            │
│       ├── Node[id=0]                                      │            │
│       │   ├── transformation: Matrix_A                   │            │
│       │   └── meshIndices: [0, 2]  ─────┐               │            │
│       │                                   │               │            │
│       └── Node[id=1]                     │               │            │
│           ├── transformation: Matrix_B   │               │            │
│           └── meshIndices: [0, 1]  ─────┤               │            │
│                                           │               │            │
│   结果：                                  │               │            │
│   ├── MeshInstanceId(0, 0) ─────────────┤───▶ 引用 Mesh[0]，变换 A │
│   ├── MeshInstanceId(0, 2) ─────────────┤───▶ 引用 Mesh[2]，变换 A │
│   ├── MeshInstanceId(1, 0) ─────────────┤───▶ 引用 Mesh[0]，变换 B │
│   └── MeshInstanceId(1, 1) ─────────────┘───▶ 引用 Mesh[1]，变换 B │
│                                                                        │
│   注意：Mesh[0] 被两个不同节点引用，但 MeshInstanceId 不同！          │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

#### 1.3 ThreeNodeTree：将引用展开为独立条目

转换的第一步是通过 `ThreeNodeTree` 遍历节点树，将所有 `(nodeId, meshIndex)` 引用展开为**独立的转换条目**：

```javascript
export class ThreeNodeTree
{
    constructor (model, threeRootNode)
    {
        this.model = model;
        this.threeNodeItems = [];  // 最终的转换任务列表
        this.AddNode (model.GetRootNode (), threeRootNode);
    }
    
    AddNode (node, threeNode)
    {
        // 步骤 1: 应用节点变换到 THREE.Object3D
        let matrix = node.GetTransformation ().GetMatrix ();
        let threeMatrix = new THREE.Matrix4 ().fromArray (matrix.Get ());
        threeNode.applyMatrix4 (threeMatrix);
        
        // 步骤 2: 递归处理子节点
        for (let childNode of node.GetChildNodes ()) {
            let threeChildNode = new THREE.Object3D ();
            threeNode.add (threeChildNode);
            this.AddNode (childNode, threeChildNode);
        }
        
        // 步骤 3: 关键！为该节点引用的每个 meshIndex 创建独立条目
        for (let meshIndex of node.GetMeshIndices ()) {
            // 每个 (nodeId, meshIndex) 组合生成唯一的 MeshInstanceId
            let id = new MeshInstanceId (node.GetId (), meshIndex);
            let mesh = this.model.GetMesh (meshIndex);
            
            // 注意：不同的 node 可能引用同一个 meshIndex
            // 但它们的 MeshInstanceId 不同，threeNode 也不同
            this.threeNodeItems.push ({
                meshInstance : new MeshInstance (id, node, mesh),
                threeNode : threeNode
            });
        }
    }
    
    GetNodeItems ()
    {
        return this.threeNodeItems;
    }
}
```
**位置：** `threeconverter.js:70-104`

**关键点：**
- `threeNodeItems` 的长度 = 模型中所有 `MeshInstance` 的数量
- 如果同一个 `Mesh` 被 100 个 `Node` 引用，这里会产生 100 个独立条目
- 每个条目有独立的 `meshInstance`（包含独立的 `id`）和独立的 `threeNode`

### 2. 几何数据处理：按实例展开，不复用

#### 2.1 转换流程：逐个 MeshInstance 独立处理

```javascript
function ConvertNodeHierarchy (threeRootNode, model, materialHandler, stateHandler)
{
    let nodeTree = new ThreeNodeTree (model, threeRootNode);
    let threeNodeItems = nodeTree.GetNodeItems ();  // 所有待转换的实例
    
    // 分批处理，避免 UI 阻塞
    RunTasksBatch (threeNodeItems.length, 100, {
        runTask : (firstMeshInstanceIndex, lastMeshInstanceIndex, onReady) => {
            for (let meshInstanceIndex = firstMeshInstanceIndex; 
                 meshInstanceIndex <= lastMeshInstanceIndex; 
                 meshInstanceIndex++) {
                let nodeItem = threeNodeItems[meshInstanceIndex];
                
                // 关键：每个 meshInstance 独立调用 ConvertMesh
                ConvertMesh (nodeItem.threeNode, nodeItem.meshInstance, materialHandler);
            }
            onReady ();
        },
        onReady : () => {
            stateHandler.OnModelLoaded (threeRootNode);
        }
    });
}
```
**位置：** `threeconverter.js:489-506`

#### 2.2 ConvertMesh：为每个实例创建独立的 THREE.Mesh

```javascript
function ConvertMesh (threeObject, meshInstance, materialHandler)
{
    if (IsEmptyMesh (meshInstance.mesh)) {
        return;
    }
    
    // 为面几何创建独立的 THREE.Mesh
    let triangleMesh = CreateThreeTriangleMesh (meshInstance, materialHandler);
    if (triangleMesh !== null) {
        threeObject.add (triangleMesh);
    }
    
    // 为线几何创建独立的 THREE.LineSegments
    let lineMesh = CreateThreeLineMesh (meshInstance, materialHandler);
    if (lineMesh !== null) {
        threeObject.add (lineMesh);
    }
}
```
**位置：** `threeconverter.js:472-487`

#### 2.3 CreateThreeTriangleMesh：每次都新建 BufferGeometry

**这是几何不复用的核心证据：**

```javascript
function CreateThreeTriangleMesh (meshInstance, materialHandler)
{
    let mesh = meshInstance.mesh;
    let triangleCount = mesh.TriangleCount ();
    if (triangleCount === 0) {
        return null;
    }
    
    // 步骤 1: 按材质索引排序三角形（为了分组）
    let triangleIndices = [];
    for (let i = 0; i < triangleCount; i++) {
        triangleIndices.push (i);
    }
    triangleIndices.sort ((a, b) => {
        let aTriangle = mesh.GetTriangle (a);
        let bTriangle = mesh.GetTriangle (b);
        return aTriangle.mat - bTriangle.mat;
    });
    
    // 步骤 2: 关键！每次都新建 THREE.BufferGeometry
    // 没有任何 "meshIndex -> BufferGeometry" 的缓存 Map
    let threeGeometry = new THREE.BufferGeometry ();
    let meshMaterialHandler = new ThreeMeshMaterialHandler (
        threeGeometry, 
        MaterialGeometryType.Face, 
        materialHandler
    );
    
    // 步骤 3: 展开顶点数据到数组（重复访问 mesh 的原始数据）
    let vertices = [];
    let vertexColors = [];
    let normals = [];
    let uvs = [];
    
    let meshHasVertexColors = (mesh.VertexColorCount () > 0);
    let meshHasUVs = (mesh.TextureUVCount () > 0);
    let processedTriangleCount = 0;
    
    for (let triangleIndex of triangleIndices) {
        let triangle = mesh.GetTriangle (triangleIndex);
        
        // 从原始 mesh 读取顶点，推入本地数组
        let v0 = mesh.GetVertex (triangle.v0);
        let v1 = mesh.GetVertex (triangle.v1);
        let v2 = mesh.GetVertex (triangle.v2);
        vertices.push (v0.x, v0.y, v0.z, v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
        
        // ... 同样处理顶点颜色、法线、UV
        if (triangle.HasVertexColors ()) { /* ... */ }
        let n0 = mesh.GetNormal (triangle.n0); // 从 mesh 读取
        normals.push (n0.x, n0.y, n0.z, ...);
        if (triangle.HasTextureUVs ()) { /* ... */ }
        
        // 为分组做准备
        meshMaterialHandler.ProcessItem (processedTriangleCount, triangle.mat);
        processedTriangleCount += 1;
    }
    meshMaterialHandler.Finalize (processedTriangleCount);
    
    // 步骤 4: 设置 BufferGeometry 的 attributes
    threeGeometry.setAttribute ('position', new THREE.Float32BufferAttribute (vertices, 3));
    if (vertexColors.length !== 0) {
        threeGeometry.setAttribute ('color', new THREE.Float32BufferAttribute (vertexColors, 3));
    }
    threeGeometry.setAttribute ('normal', new THREE.Float32BufferAttribute (normals, 3));
    if (uvs.length !== 0) {
        threeGeometry.setAttribute ('uv', new THREE.Float32BufferAttribute (uvs, 2));
    }
    
    // 步骤 5: 创建 THREE.Mesh
    let threeMesh = new THREE.Mesh (threeGeometry, meshMaterialHandler.meshThreeMaterials);
    threeMesh.name = mesh.GetName ();
    
    // 步骤 6: 设置 userData（关键：每个 MeshInstance 独立）
    threeMesh.userData = {
        originalMeshInstance : meshInstance,      // 指向独立的 MeshInstance
        originalMaterials : meshMaterialHandler.meshOriginalMaterials,
        threeMaterials : null
    };
    
    return threeMesh;
}
```
**位置：** `threeconverter.js:329-420`

#### 2.4 几何不复用的关键特征总结

| 特征 | 证据 |
|------|------|
| 无全局缓存 | 没有 `meshIndex -> BufferGeometry` 的 Map 结构 |
| 每次新建 | `let threeGeometry = new THREE.BufferGeometry()` 在循环内 |
| 数据重复展开 | `vertices/normals/uvs` 数组在每个 `CreateThreeTriangleMesh` 中重新构建 |
| userData 独立 | `originalMeshInstance` 指向不同的 MeshInstance 对象 |

### 3. 材质缓存机制：全局共享，跨实例复用

#### 3.1 核心缓存结构

与几何处理形成鲜明对比的是材质处理：

```javascript
export class ThreeMaterialHandler
{
    constructor (model, stateHandler, conversionParams, conversionOutput)
    {
        this.model = model;
        this.stateHandler = stateHandler;
        this.conversionParams = conversionParams;
        this.conversionOutput = conversionOutput;
        
        this.shadingType = GetShadingType (model);
        
        // 关键：全局 Map 缓存，key 是 OV 内部材质索引（数字）
        this.modelToThreeLineMaterial = new Map ();
        this.modelToThreeMaterial = new Map ();
    }
    
    GetThreeMaterial (modelMaterialIndex, geometryType)
    {
        if (geometryType === MaterialGeometryType.Face) {
            // 命中缓存则直接返回同一个 THREE.Material 对象
            if (!this.modelToThreeMaterial.has (modelMaterialIndex)) {
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

#### 3.2 材质缓存与几何处理的协作：ThreeMeshMaterialHandler

虽然几何不复用，但**材质对象是共享的**。这种协作发生在 `ThreeMeshMaterialHandler` 层面：

```javascript
export class ThreeMeshMaterialHandler
{
    constructor (threeGeometry, geometryType, materialHandler)
    {
        this.threeGeometry = threeGeometry;
        this.geometryType = geometryType;
        this.materialHandler = materialHandler;  // 全局材质缓存的访问点
        
        this.itemVertexCount = (geometryType === MaterialGeometryType.Face) ? 3 : 2;
        
        // 每个 MeshInstance 独立的材质数组
        // 但数组中的元素是从全局缓存获取的共享对象
        this.meshThreeMaterials = [];
        this.meshOriginalMaterials = [];
        
        this.groupStart = null;
        this.previousMaterialIndex = null;
    }
    
    ProcessItem (itemIndex, materialIndex)
    {
        if (this.previousMaterialIndex !== materialIndex) {
            if (this.groupStart !== null) {
                this.AddGroup (this.groupStart, itemIndex - 1);
            }
            this.groupStart = itemIndex;
            
            // 关键：从全局缓存获取 THREE.Material
            // 不同的 MeshInstance 如果用同一个 materialIndex，会拿到同一个对象
            let threeMaterial = this.materialHandler.GetThreeMaterial (
                materialIndex, 
                this.geometryType
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
        // 使用 THREE.BufferGeometry 的 groups 机制
        // 让单个 Geometry 的不同范围使用不同材质
        let materialIndex = this.meshThreeMaterials.length - 1;
        this.threeGeometry.addGroup (
            start * this.itemVertexCount, 
            (end - start + 1) * this.itemVertexCount, 
            materialIndex  // 指向 meshThreeMaterials 数组的索引
        );
    }
}
```
**位置：** `threeconverter.js:277-325`

### 4. 几何 vs 材质：缓存边界的清晰对比

#### 4.1 数据结构对比

```
┌────────────────────────────────────────────────────────────────────────┐
│                    几何 vs 材质：缓存策略对比                           │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  【材质：全局共享】                                                    │
│                                                                        │
│  ThreeMaterialHandler                                                  │
│  ├── modelToThreeMaterial: Map                                        │
│  │   ├── 0 ──▶ THREE.MeshPhongMaterial (共享对象)                    │
│  │   ├── 1 ──▶ THREE.MeshStandardMaterial (共享对象)                 │
│  │   └── 2 ──▶ THREE.LineBasicMaterial (共享对象)                     │
│  │                                                                    │
│  结果：所有使用 materialIndex=0 的 MeshInstance                       │
│        都引用同一个 THREE.Material 对象                               │
│                                                                        │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  【几何：按实例展开】                                                  │
│                                                                        │
│  MeshInstance[0] (nodeId=0, meshIndex=0)                             │
│  ├── threeGeometry: THREE.BufferGeometry #1 (独立)                   │
│  └── meshThreeMaterials: [THREE.MeshPhongMaterial (共享)]            │
│                                                                        │
│  MeshInstance[1] (nodeId=1, meshIndex=0)  ← 同一个 meshIndex！      │
│  ├── threeGeometry: THREE.BufferGeometry #2 (独立，数据与 #1 重复)  │
│  └── meshThreeMaterials: [THREE.MeshPhongMaterial (同一个共享对象)]  │
│                                                                        │
│  结果：虽然引用同一个底层 Mesh                                         │
│        但 BufferGeometry 是独立创建的，顶点数据重复存储               │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

#### 4.2 按材质分组的层级

`ThreeMeshMaterialHandler` 的分组是**在单个 MeshInstance 内部**进行的，不是全局的：

```
场景：一个 Mesh 包含 100 个三角形，其中 40 个用 material=0，60 个用 material=1
      这个 Mesh 被两个不同的 Node 引用（两个 MeshInstance）

转换结果：
┌────────────────────────────────────────────────────────────────────┐
│  MeshInstance A (nodeId=0, meshIndex=0)                            │
│  ├── threeGeometry A                                                 │
│  │   ├── group 0: 三角形 0-39, 使用 meshThreeMaterials[0]          │
│  │   └── group 1: 三角形 40-99, 使用 meshThreeMaterials[1]         │
│  │                                                                    │
│  └── meshThreeMaterials: [mat0_shared, mat1_shared]                 │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  MeshInstance B (nodeId=1, meshIndex=0)                            │
│  ├── threeGeometry B  ← 独立的 BufferGeometry，顶点数据与 A 重复   │
│  │   ├── group 0: 三角形 0-39, 使用 meshThreeMaterials[0]          │
│  │   └── group 1: 三角形 40-99, 使用 meshThreeMaterials[1]         │
│  │                                                                    │
│  └── meshThreeMaterials: [mat0_shared, mat1_shared]  ← 相同的材质  │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘

关键点：
- 几何数据：A 和 B 有独立的 BufferGeometry，内存重复
- 材质对象：A 和 B 共享 mat0_shared 和 mat1_shared
- 分组逻辑：在 A、B 内部独立进行，不是全局合并
```

### 5. 为什么材质可复用而几何不复用？

这是理解 OV 设计的核心问题。答案在于**选中状态同步的需求**和**变换处理方式**。

#### 5.1 原因 1：变换在节点层级应用，不是 bake 到顶点

看 `ThreeNodeTree.AddNode` 中变换的处理方式：

```javascript
AddNode (node, threeNode)
{
    // 变换应用到 THREE.Object3D 层级
    let matrix = node.GetTransformation ().GetMatrix ();
    let threeMatrix = new THREE.Matrix4 ().fromArray (matrix.Get ());
    threeNode.applyMatrix4 (threeMatrix);
    
    // ... 子节点和 mesh 引用处理
}
```
**位置：** `threeconverter.js:79-83`

**关键：** 变换是应用到 `threeNode`（THREE.Object3D）上，不是 bake 到顶点数据中。

这意味着：
- 如果两个 Node 用不同变换引用同一个 Mesh，**顶点数据本身是相同的**
- 变换由 Object3D 的 matrix 提供，不是 vertex attribute

**理论上可以共享 BufferGeometry**，但 OV 选择不共享。为什么？

#### 5.2 原因 2：选中同步需要 MeshInstanceId 级别的独立性

让我们追溯 `userData.originalMeshInstance` 的使用方式：

```javascript
// 场景树中每个 THREE.Mesh 的 userData
threeMesh.userData = {
    originalMeshInstance : meshInstance,  // 每个 Mesh 指向不同的实例
    originalMaterials : [...],
    threeMaterials : null
};
```
**位置：** `threeconverter.js:413-417`

**在 website.js 中的使用（选中逻辑）：**

```javascript
// 鼠标点击后的选中设置
this.navigator.SetSelection (
    new Selection (
        SelectionType.Mesh, 
        meshUserData.originalMeshInstance.id  // 关键：使用 MeshInstanceId
    )
);

// 可见性切换
this.navigator.ToggleMeshVisibility (meshUserData.originalMeshInstance.id);

// 独立判断
return meshUserData.originalMeshInstance.id.IsEqual (meshInstanceId);
```
**位置：** `website.js:321, 358, 437`

**核心问题：如果 BufferGeometry 共享，会怎样？**

假设我们实现几何复用：

```
【假设的共享方案】
Mesh (index=0) ──┬──▶ MeshInstance A (nodeId=0) ──┐
                 │                                  ├──▶ 共享 BufferGeometry
                 └──▶ MeshInstance B (nodeId=1) ──┘

问题：
- Raycaster 拾取时，返回的是 THREE.Mesh，不是 BufferGeometry
- 如果要共享 BufferGeometry，需要创建两个 THREE.Mesh 引用同一个 Geometry
- 这在技术上是可行的！THREE.Mesh 可以共享 Geometry

但 OV 为什么不这样做？
```

让我们再看 `CreateThreeTriangleMesh` 的完整流程：

```javascript
function CreateThreeTriangleMesh (meshInstance, materialHandler)
{
    // ...
    
    // 注意：三角形排序是在 MeshInstance 层面做的
    // 但实际上排序只依赖 mesh.triangle[i].mat，不依赖 node
    triangleIndices.sort ((a, b) => {
        let aTriangle = mesh.GetTriangle (a);
        let bTriangle = mesh.GetTriangle (b);
        return aTriangle.mat - bTriangle.mat;
    });
    
    // ...
    
    // 顶点展开也只依赖 mesh 的数据
    let v0 = mesh.GetVertex (triangle.v0);
    // ...
    
    // 关键区别在于 userData
    threeMesh.userData = {
        originalMeshInstance : meshInstance,  // 这个是不同的！
        // ...
    };
}
```

**答案：OV 当前的实现选择"简单直接"而非"最大复用"**

实际上，从技术角度看，OV **可以**实现 BufferGeometry 复用，因为：
1. 顶点数据只依赖 `mesh`，不依赖 `node`
2. 变换在 Object3D 层级应用
3. `userData` 是挂在 THREE.Mesh 上，不是 BufferGeometry

但 OV 选择了**每次都新建**，可能的原因：

| 因素 | 说明 |
|------|------|
| 实现简单 | 不需要维护 `meshIndex -> BufferGeometry` 的额外缓存 Map |
| 内存 vs 可预测性 | 对于大多数模型（实例化不多的场景），重复内存不是问题 |
| 避免共享陷阱 | 如果未来需要在 Geometry 层面做实例特定修改，共享会有问题 |
| 代码路径统一 | 所有 MeshInstance 走相同的创建路径，没有特殊情况 |

#### 5.3 原因 3：高亮和可见性需要独立控制

看 Viewer 层的实现：

```javascript
// 可见性控制
SetMeshesVisibility (isVisible)
{
    this.mainModel.EnumerateMeshesAndLines ((mesh) => {
        // mesh 是 THREE.Mesh，独立的 visible 属性
        let visible = isVisible (mesh.userData);
        if (mesh.visible !== visible) {
            mesh.visible = visible;
        }
    });
    // ...
}
```
**位置：** `viewer.js:449-464`

```javascript
// 高亮控制
SetMeshesHighlight (highlightColor, isHighlighted)
{
    this.mainModel.EnumerateMeshesAndLines ((mesh) => {
        let highlighted = isHighlighted (mesh.userData);
        
        if (highlighted) {
            if (mesh.userData.threeMaterials === null) {
                // 保存当前材质引用
                mesh.userData.threeMaterials = mesh.material;
                // 替换为高亮材质数组
                mesh.material = CreateHighlightMaterials (...);
            }
        } else {
            if (mesh.userData.threeMaterials !== null) {
                // 恢复
                mesh.material = mesh.userData.threeMaterials;
                mesh.userData.threeMaterials = null;
            }
        }
    });
}
```
**位置：** `viewer.js:466-485`

**关键点：**
- `mesh.visible` 是 THREE.Mesh 的属性，不是 BufferGeometry 的
- `mesh.material` 替换也是替换 THREE.Mesh 的 material 引用
- 即使 BufferGeometry 共享，这些操作仍然可以独立进行

**所以"选中同步"并不是阻止几何复用的根本原因**，根本原因更可能是**实现简单性优先**的设计选择。

### 6. 对性能和选中同步的影响

#### 6.1 性能影响

```
┌────────────────────────────────────────────────────────────────────────┐
│                    当前设计的性能特征                                   │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  【内存占用】                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  场景：同一个 Mesh 包含 10000 个顶点，被 N 个 Node 引用          │ │
│  │                                                                    │ │
│  │  当前设计（不复用）：                                              │ │
│  │  ├── 顶点数据：10000 × 3 floats × N 份 = 120N KB (float32)     │ │
│  │  ├── 法线数据：同样 120N KB                                       │ │
│  │  ├── UV 数据：如果有，80N KB                                      │ │
│  │  └── 材质对象：N 个数组，但元素是共享引用                          │ │
│  │                                                                    │ │
│  │  如果复用 Geometry：                                               │ │
│  │  ├── 顶点/法线/UV：各 1 份，与 N 无关                             │ │
│  │  └── 内存节省：O(N) 级别的减少                                    │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│  【Draw Call】                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  当前设计：                                                        │ │
│  │  ├── 每个 MeshInstance 至少 1 个 draw call（面）                 │ │
│  │  ├── 如果用了多种材质，每个 group 增加 draw call                 │ │
│  │  └── 总 draw call 数与 MeshInstance 数量正相关                   │ │
│  │                                                                    │ │
│  │  如果用 GPU Instancing：                                          │ │
│  │  ├── 相同 Geometry + 相同材质可以合并为 1 个 draw call           │ │
│  │  └── 但需要额外的 per-instance attribute（transform 等）         │ │
│  │                                                                    │ │
│  │  OV 的选择：不做 instancing，保持简单                             │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│  【GPU 材质状态切换】                                                  │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  当前设计：                                                        │ │
│  │  ├── 材质对象是共享的                                              │ │
│  │  └── 如果连续 draw call 使用相同材质，GPU 状态切换开销较小        │ │
│  │                                                                    │ │
│  │  这是材质缓存带来的好处，与几何复用无关                            │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

#### 6.2 对选中同步的影响

当前设计对选中同步是**友好的**，因为：

```
每个 THREE.Mesh 有独立的 userData：
┌─────────────────────────────────────────────────────────────────────┐
│  THREE.Mesh A (for MeshInstance A)                                   │
│  ├── userData.originalMeshInstance.id = (nodeId=0, meshIndex=0)    │
│  ├── visible: 独立控制                                                │
│  └── material: 可独立替换为高亮材质                                   │
│                                                                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  THREE.Mesh B (for MeshInstance B)                                   │
│  ├── userData.originalMeshInstance.id = (nodeId=1, meshIndex=0)    │
│  ├── visible: 独立控制                                                │
│  └── material: 可独立替换为高亮材质                                   │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘

鼠标拾取流程：
1. Raycaster.intersectObject() 返回 THREE.Mesh
2. mesh.userData.originalMeshInstance.id 就是选中目标
3. 与导航器中的 selection 比较（通过 MeshInstanceId.IsEqual）
4. 高亮时遍历所有 Mesh，通过 userData 判断是否需要高亮

这种设计非常直接："你点到的那个 Mesh 的 userData 就是答案"
```

**对比：如果几何复用但 Mesh 独立**

实际上，即使 BufferGeometry 共享，只要 THREE.Mesh 独立，上述流程完全不变。因为：
- `raycaster.intersectObject()` 返回的是 THREE.Mesh
- `mesh.userData` 挂在 THREE.Mesh 上，不是 BufferGeometry
- `mesh.visible` 和 `mesh.material` 也是 THREE.Mesh 的属性

**所以几何不复用不是选中同步的必要条件**，只是 OV 当前的实现选择。

### 7. 纹理异步加载与状态同步

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
export class MeshInstance extends ModelObject3D
{
    constructor (id, node, mesh)
    {
        super ();
        this.id = id;      // MeshInstanceId (nodeId, meshIndex)
        this.node = node;  // 场景图节点引用
        this.mesh = mesh;  // 几何数据引用
    }
    
    GetTransformation ()
    {
        return this.node.GetWorldTransformation ();
    }
    // ...
}
```
**位置：** `meshinstance.js:23-138`

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

看 `exportergltf.js` 等导出器的实现：它们直接读取 Model/Mesh/Material，不依赖 Three.js。

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

内部模型层定义了"什么是