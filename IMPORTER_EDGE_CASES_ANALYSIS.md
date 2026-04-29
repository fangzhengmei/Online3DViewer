# Online3DViewer 导入器边界问题深度分析报告

> **分析基础**: 基于 `IMPORTER_ARCHITECTURE_ANALYSIS_REVISED.md` 的深入挖掘
> **数据来源**: 代码静态分析 + 官方测试用例验证

---

## 目录

- [问题一：补充缺失依赖后的记录重置与更新](#问题一补充缺失依赖后的记录重置与更新)
- [问题二：压缩包解压后的文件追踪](#问题二压缩包解压后的文件追踪)
- [问题三：运行时扩展导入器的边界行为](#问题三运行时扩展导入器的边界行为)

---

## 问题一：补充缺失依赖后的记录重置与更新

### 结论

**缺失记录 (missingFiles) 的生命周期遵循"每次导入重置"策略**，而文件列表 (fileList) 的扩展需要满足**双条件**。

#### 核心规则

| 数据结构 | 重置时机 | 扩展条件 |
|---------|---------|---------|
| `missingFiles` | 每次 `ImportLoadedMainFile` 开始时重置为空数组 | 不扩展，每次导入重新计算 |
| `usedFiles` | 每次 `ImportLoadedMainFile` 开始时重置为 `[mainFile]` | 导入过程中动态追加 |
| `fileList` | 新文件包含可导入格式时完全替换 | **双条件**: (1) 新文件不可导入 + (2) 匹配之前的 `missingFiles` |

#### 关键发现

> ⚠️ **陷阱场景**：如果用户在缺失文件后拖入一个**既不是可导入格式、也不是缺失文件**的文件，`fileList` 会被**完全替换**，之前的主文件会丢失！

---

### 证据

#### 证据 1: ImportLoadedMainFile 中的重置逻辑

**文件位置**: `source/engine/import/importer.js:188-202`

```javascript
ImportLoadedMainFile (mainFile, settings, callbacks)
{
    // ... 参数校验 ...
    
    this.model = null;
    this.usedFiles = [];        // 【重置】每次导入都清空
    this.missingFiles = [];     // 【重置】每次导入都清空
    this.usedFiles.push(mainFile.file.name);  // 初始化为主文件
    
    // ... 导入过程中动态更新 usedFiles/missingFiles ...
}
```

**分析**:
- `missingFiles` 和 `usedFiles` 在**每次导入开始时**被重置
- `usedFiles` 初始化为只包含主文件
- 这意味着：每次导入都是**独立的**，会重新计算缺失文件

#### 证据 2: LoadFiles 中的双条件扩展决策

**文件位置**: `source/engine/import/importer.js:129-160`

```javascript
LoadFiles (inputFiles, callbacks)
{
    let newFileList = new ImporterFileList();
    newFileList.FillFromInputFiles(inputFiles);

    let reset = false;
    
    // 【条件 A】新文件是否包含可导入格式？
    if (this.HasImportableFile(newFileList)) {
        reset = true;  // 包含可导入格式 → 完全替换
    } else {
        // 【条件 A 满足】新文件不包含可导入格式
        
        // 【条件 B】新文件是否匹配之前记录的缺失文件？
        let foundMissingFile = false;
        for (let i = 0; i < this.missingFiles.length; i++) {
            let missingFile = this.missingFiles[i];
            if (newFileList.ContainsFileByPath(missingFile)) {
                foundMissingFile = true;  // 找到匹配的缺失文件
            }
        }
        
        if (!foundMissingFile) {
            // 【条件 B 不满足】没有找到任何缺失文件
            reset = true;  // → 完全替换（陷阱！）
        } else {
            // 【双条件都满足】扩展文件列表
            this.fileList.ExtendFromFileList(newFileList);
            reset = false;
        }
    }
    
    if (reset) {
        this.fileList = newFileList;  // 完全替换
    }
    
    // ... 加载文件内容 ...
}
```

**分析**:

**决策表**:

| 新文件包含可导入格式？ | 新文件匹配 missingFiles？ | reset | 行为 |
|----------------------|--------------------------|-------|------|
| 是 | 任意 | true | 完全替换 fileList |
| 否 | 否 | true | **完全替换（陷阱）** |
| 否 | 是 | false | 扩展 fileList |

#### 证据 3: 官方测试用例验证

**文件位置**: `test/tests/importer_test.js:193-226`

```javascript
it ('Append Missing files', function (done) {
    let theImporter = new OV.Importer();  // 使用同一个实例
    
    // 【第 1 次】只导入 .obj
    ImportFilesWithImporter(theImporter, 
        [new FileObject('', 'obj/cube_with_materials.obj')], 
    {
        success: function (importer, importResult) {
            // 验证 1: usedFiles 只包含主文件
            assert.deepStrictEqual(importResult.usedFiles, ['cube_with_materials.obj']);
            // 验证 2: missingFiles 记录缺失的 .mtl
            assert.deepStrictEqual(importResult.missingFiles, ['cube_with_materials.mtl']);
            
            // 【第 2 次】只导入 .mtl（关键：不导入 .obj！）
            ImportFilesWithImporter(theImporter, 
                [new FileObject('', 'obj/cube_with_materials.mtl')], 
            {
                success: function (importer, importResult) {
                    // ⚠️ 关键验证: usedFiles 包含 .obj + .mtl
                    // 这证明 fileList 被扩展了，之前的 .obj 保留着！
                    assert.deepStrictEqual(importResult.usedFiles, 
                        ['cube_with_materials.obj', 'cube_with_materials.mtl']);
                    // 验证: missingFiles 更新为缺失的 .png
                    assert.deepStrictEqual(importResult.missingFiles, ['cube_texture.png']);
                    
                    // 【第 3 次】只导入 .png
                    ImportFilesWithImporter(theImporter, 
                        [new FileObject('', 'obj/cube_texture.png')], 
                    {
                        success: function (importer, importResult) {
                            // 验证: 所有文件都在 usedFiles 中
                            assert.deepStrictEqual(importResult.usedFiles, 
                                ['cube_with_materials.obj', 'cube_with_materials.mtl', 'cube_texture.png']);
                            assert.deepStrictEqual(importResult.missingFiles, []);
                            done();
                        },
                        // ...
                    });
                },
                // ...
            });
        },
        // ...
    });
});
```

**测试验证的关键点**:

1. **第 2 次只导入 .mtl** → `usedFiles` 包含 `.obj + .mtl`
   - 这证明 `fileList` 被**扩展**了，之前的 `.obj` 没有丢失
   - 满足双条件：.mtl 不可导入 + .mtl 在 missingFiles 中

2. **每次导入 missingFiles 都被重新计算**
   - 第 1 次: `['cube_with_materials.mtl']`
   - 第 2 次: `['cube_texture.png']`
   - 第 3 次: `[]`

#### 证据 4: 重置场景测试

**文件位置**: `test/tests/importer_test.js:228-261`

```javascript
it ('Reuse importer', function (done) {
    let files1 = [
        new FileObject('', 'obj/cube_with_materials.obj'),
        new FileObject('', 'obj/cube_with_materials.mtl'),
        new FileObject('', 'obj/cube_texture.png')
    ];
    let files2 = [
        new FileObject('', 'obj/single_triangle.obj')  // 可导入格式
    ];

    let theImporter = new OV.Importer();
    
    // 第 1 次: 导入完整的 cube
    ImportFilesWithImporter(theImporter, files1, {
        success: function (importer, importResult) {
            assert.deepStrictEqual(importResult.usedFiles, 
                ['cube_with_materials.obj', 'cube_with_materials.mtl', 'cube_texture.png']);
            
            // 第 2 次: 只导入 single_triangle.obj（包含可导入格式）
            ImportFilesWithImporter(theImporter, files2, {
                success: function (importer, importResult) {
                    // ⚠️ 关键验证: usedFiles 只包含 single_triangle.obj
                    // 这证明之前的文件被完全替换了！
                    assert.deepStrictEqual(importResult.usedFiles, ['single_triangle.obj']);
                    assert.deepStrictEqual(importResult.missingFiles, []);
                    done();
                },
                // ...
            });
        },
        // ...
    });
});
```

**验证**:
- 第 2 次导入包含可导入格式 `.obj` → `reset = true`
- `fileList` 被完全替换
- `usedFiles` 只包含新的主文件

---

### 可复现步骤

#### 场景 A: 正常的逐步补充依赖（推荐流程）

**前提**: 使用**同一个** `Importer` 实例

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  步骤 1: 只拖入 cube_with_materials.obj                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  fileList = [cube_with_materials.obj]                                        │
│  usedFiles = ['cube_with_materials.obj']                                     │
│  missingFiles = ['cube_with_materials.mtl']  ← 记录缺失                     │
│  结果: 模型显示，但没有材质                                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│  步骤 2: 只拖入 cube_with_materials.mtl（⚠️ 不拖入 .obj）                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  【条件 A 检查】新文件是否包含可导入格式？                                    │
│    .mtl 不是可导入格式 → 条件 A 满足                                          │
│                                                                              │
│  【条件 B 检查】新文件是否匹配 missingFiles？                                 │
│    missingFiles = ['cube_with_materials.mtl']                               │
│    新文件包含 cube_with_materials.mtl → 条件 B 满足                          │
│                                                                              │
│  → reset = false → fileList 被扩展                                           │
│  fileList = [cube_with_materials.obj, cube_with_materials.mtl]             │
│                                                                              │
│  重新导入:                                                                    │
│    - 从 fileList 选择可导入文件: cube_with_materials.obj                    │
│    - 重新计算 usedFiles/missingFiles                                         │
│  usedFiles = ['cube_with_materials.obj', 'cube_with_materials.mtl']         │
│  missingFiles = ['cube_texture.png']  ← 更新                                │
│  结果: 模型有材质，但没有贴图                                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│  步骤 3: 只拖入 cube_texture.png                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  【条件 A 检查】.png 不是可导入格式 → 条件 A 满足                             │
│  【条件 B 检查】.png 在 missingFiles 中 → 条件 B 满足                        │
│  → fileList 被扩展                                                            │
│                                                                              │
│  fileList = [obj, mtl, png]                                                  │
│  usedFiles = [obj, mtl, png]                                                 │
│  missingFiles = []                                                            │
│  结果: 模型完全显示                                                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 场景 B: 陷阱场景 - 拖入无关文件

**⚠️ 危险操作**: 在缺失文件后拖入**无关文件**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  步骤 1: 只拖入 cube_with_materials.obj                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  fileList = [cube_with_materials.obj]                                        │
│  missingFiles = ['cube_with_materials.mtl']                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│  步骤 2: 拖入无关文件 some_other_file.txt                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  【条件 A 检查】.txt 不是可导入格式 → 条件 A 满足                             │
│                                                                              │
│  【条件 B 检查】新文件是否匹配 missingFiles？                                 │
│    missingFiles = ['cube_with_materials.mtl']                               │
│    新文件是 some_other_file.txt → 不匹配 → 条件 B 不满足                    │
│                                                                              │
│  → reset = true → fileList 被完全替换！                                      │
│                                                                              │
│  fileList = [some_other_file.txt]  ← ⚠️ cube_with_materials.obj 丢失了！   │
│                                                                              │
│  重新导入:                                                                    │
│    - .txt 不是可导入格式                                                     │
│    - 报错: NoImportableFile                                                  │
│  结果: 之前的模型丢失！                                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 场景 C: 每次创建新 Importer 实例

**注意**: 官方测试中还有一种场景是**每次创建新的 Importer**，这种情况下不会有扩展行为。

**文件位置**: `test/tests/importer_test.js:136-173`

```javascript
// 'Missing files' 测试 - 每次创建新的 Importer
it ('Missing files', function (done) {
    let files = [];
    files.push(new FileObject('', 'obj/cube_with_materials.obj'));
    
    ImportFiles(files, {  // ImportFiles 内部每次创建新的 Importer
        success: function (importer, importResult) {
            // ...
            files.push(new FileObject('', 'obj/cube_with_materials.mtl'));
            ImportFiles(files, {  // 新的 Importer 实例
                success: function (importer, importResult) {
                    // ⚠️ 这里 files 数组包含了之前的文件
                    // 新的 Importer 没有之前的 missingFiles 记忆
                    // 所以必须在 files 数组中包含所有文件
                },
                // ...
            });
        },
        // ...
    });
});
```

**关键区别**:

| 模式 | fileList 行为 | 适用场景 |
|------|--------------|---------|
| 同一 Importer 实例 | 可能扩展 | 交互式逐步补充 |
| 每次新建 Importer | 每次都是新的 | 批处理、无状态导入 |

---

## 问题二：压缩包解压后的文件追踪

### 结论

**ZIP 解压后的文件能够被准确追踪**，但存在以下特性和边界情况：

#### 核心规则

| 特性 | 行为 |
|------|------|
| ZIP 本身的追踪 | **不记录**到 `usedFiles`，只记录解压后的内部文件 |
| 路径处理 | ZIP 内部目录**被剥离**，只保留文件名 |
| 多 ZIP 支持 | 可以同时拖入多个 ZIP，所有解压文件合并到同一 `fileList` |
| 解压时机 | `LoadFiles` 之后、`ImportLoadedFiles` 之前 |
| FileSource | 解压后的文件标记为 `FileSource.Decompressed` |

#### 关键发现

> ⚠️ **边界问题**: 如果 ZIP 中不同目录下有**同名文件**（如 `dir1/texture.png` 和 `dir2/texture.png`），解压后都会变成 `texture.png`，`FindFileByPath` 只会返回**第一个**，第二个永远无法访问。

---

### 证据

#### 证据 1: DecompressArchives 实现

**文件位置**: `source/engine/import/importer.js:250-276`

```javascript
DecompressArchives (fileList, onReady)
{
    let files = fileList.GetFiles();
    let archives = [];
    
    // 步骤 1: 收集所有 ZIP 文件
    for (let file of files) {
        if (file.extension === 'zip') {
            archives.push(file);
        }
    }
    
    if (archives.length === 0) {
        onReady();
        return;
    }
    
    // 步骤 2: 解压每个 ZIP
    for (let i = 0; i < archives.length; i++) {
        const archiveFile = archives[i];
        const archiveBuffer = new Uint8Array(archiveFile.content);
        const decompressed = fflate.unzipSync(archiveBuffer);
        
        // 步骤 3: 将解压后的文件添加到 fileList
        for (const fileName in decompressed) {
            if (Object.prototype.hasOwnProperty.call(decompressed, fileName)) {
                // ⚠️ 关键: 创建 ImporterFile 时路径会被 GetFileName 剥离
                let file = new ImporterFile(
                    fileName,                    // ZIP 内部的完整路径（可能包含目录）
                    FileSource.Decompressed,     // 标记为解压来源
                    null
                );
                file.SetContent(decompressed[fileName].buffer);
                fileList.AddFile(file);  // 添加到 fileList
            }
        }
    }
    
    onReady();
}
```

**分析**:
- ZIP 文件本身保留在 `fileList` 中，但解压后的文件会**追加**进去
- `fileName` 是 ZIP 内部的完整路径（如 `models/cube.obj`）
- `ImporterFile` 构造时会用 `GetFileName` 提取纯文件名

#### 证据 2: GetFileName 路径剥离逻辑

**文件位置**: `source/engine/io/fileutils.js:21-39`

```javascript
export function GetFileName (filePath)
{
    let fileName = filePath;
    
    // 步骤 1: 去掉 URL 参数（如 ?v=1.0）
    let firstParamIndex = fileName.indexOf('?');
    if (firstParamIndex !== -1) {
        fileName = fileName.substring(0, firstParamIndex);
    }
    
    // 步骤 2: 找到最后一个路径分隔符（支持 / 和 \）
    let firstSeparator = fileName.lastIndexOf('/');
    if (firstSeparator === -1) {
        firstSeparator = fileName.lastIndexOf('\\');
    }
    
    // 步骤 3: 只保留分隔符之后的部分
    if (firstSeparator !== -1) {
        fileName = fileName.substring(firstSeparator + 1);
    }
    
    return decodeURI(fileName);
}
```

**示例**:

| 输入 | 输出 |
|------|------|
| `models/cube.obj` | `cube.obj` |
| `textures\wood.png` | `wood.png` |
| `cube.stl` | `cube.stl` |
| `archive.zip?raw=true` | `archive.zip` |

#### 证据 3: 官方测试用例验证

**文件位置**: `test/tests/importer_test.js:295-345`

```javascript
// 测试 1: 普通 ZIP
it ('Zip file', function (done) {
    let files = [new FileObject('', 'zip/cube_four_instances.zip')];
    ImportFiles(files, {
        success: function (importer, importResult) {
            // ZIP 内容: cube_four_instances.3ds + texture.png
            // 验证: 解压后的文件被正确追踪
            assert.deepStrictEqual(importResult.usedFiles, 
                ['cube_four_instances.3ds', 'texture.png']);
            assert.deepStrictEqual(importResult.missingFiles, []);
            // ⚠️ 注意: cube_four_instances.zip 本身不在 usedFiles 中！
            done();
        },
        // ...
    });
});

// 测试 2: 带目录的 ZIP
it ('Zip file with Folders', function (done) {
    let files = [new FileObject('', 'zip/cube_four_instances_folders.zip')];
    ImportFiles(files, {
        success: function (importer, importResult) {
            // ZIP 内容: models/cube_four_instances.3ds + textures/texture.png
            // 验证: 路径被剥离，只保留文件名
            assert.deepStrictEqual(importResult.usedFiles, 
                ['cube_four_instances.3ds', 'texture.png']);
            assert.deepStrictEqual(importResult.missingFiles, []);
            done();
        },
        // ...
    });
});

// 测试 3: 多个 ZIP
it ('Multiple Zip Files', function (done) {
    let files = [
        // ZIP 1 内容: cube_with_materials.obj + cube_with_materials.mtl
        new FileObject('', 'zip/cube_with_materials_notexture.zip'),
        // ZIP 2 内容: cube_texture.png
        new FileObject('', 'zip/textures.zip')
    ];
    ImportFiles(files, {
        success: function (importer, importResult) {
            // 验证: 两个 ZIP 的内容合并
            assert.deepStrictEqual(importResult.usedFiles, 
                ['cube_with_materials.obj', 'cube_with_materials.mtl', 'cube_texture.png']);
            assert.deepStrictEqual(importResult.missingFiles, []);
            done();
        },
        // ...
    });
});
```

**测试验证的关键点**:

1. **ZIP 本身不被追踪** → `usedFiles` 中只有解压后的文件
2. **路径被剥离** → 带目录的 ZIP 和普通 ZIP 产生相同的 `usedFiles`
3. **多 ZIP 合并** → 多个 ZIP 的内容可以协同工作

#### 证据 4: ImporterFileList 的文件查找

**文件位置**: `source/engine/import/importerfiles.js:111-121`

```javascript
FindFileByPath (filePath)
{
    // 步骤 1: 提取文件名并转小写
    let fileName = GetFileName(filePath).toLowerCase();
    
    // 步骤 2: 顺序遍历，返回第一个匹配
    for (let fileIndex = 0; fileIndex < this.files.length; fileIndex++) {
        let file = this.files[fileIndex];
        if (file.name.toLowerCase() === fileName) {
            return file;  // 第一个匹配即返回
        }
    }
    return null;
}
```

**分析**:
- 只比较文件名（通过 `GetFileName` 提取）
- 顺序遍历，**第一个匹配**返回
- 这意味着：同名文件中，先添加的会被访问

---

### 可复现步骤

#### 场景 A: 普通 ZIP 解压

```
ZIP 文件: cube_four_instances.zip
ZIP 内部结构:
  cube_four_instances.3ds
  texture.png

步骤: 拖入 cube_four_instances.zip

执行流程:
  1. LoadFiles: fileList = [cube_four_instances.zip (source=File)]
  2. DecompressArchives:
     - 解压 ZIP
     - 创建: cube_four_instances.3ds (source=Decompressed)
     - 创建: texture.png (source=Decompressed)
     - 追加到 fileList
  3. fileList 最终 = [
       cube_four_instances.zip (File),
       cube_four_instances.3ds (Decompressed),
       texture.png (Decompressed)
     ]
  4. GetImportableFiles:
     - cube_four_instances.zip (.zip): 不可导入
     - cube_four_instances.3ds (.3ds): 可导入 (Importer3ds)
     - texture.png (.png): 不可导入
     → 选择 cube_four_instances.3ds 为主文件
  5. 导入过程:
     - Importer3ds 访问 texture.png
     - 找到: texture.png (Decompressed)
     - usedFiles 追加 'texture.png'

结果:
  usedFiles = ['cube_four_instances.3ds', 'texture.png']
  missingFiles = []
  ⚠️ cube_four_instances.zip 不在 usedFiles 中
```

#### 场景 B: 带目录的 ZIP

```
ZIP 文件: cube_four_instances_folders.zip
ZIP 内部结构:
  models/
    cube_four_instances.3ds
  textures/
    texture.png

步骤: 拖入 cube_four_instances_folders.zip

执行流程:
  1. 解压时:
     - 'models/cube_four_instances.3ds' 
       → GetFileName 提取 → 'cube_four_instances.3ds'
     - 'textures/texture.png'
       → GetFileName 提取 → 'texture.png'
  2. fileList 中的文件名（无路径）:
     - cube_four_instances.3ds
     - texture.png

结果:
  usedFiles = ['cube_four_instances.3ds', 'texture.png']
  与不带目录的 ZIP 行为完全一致
```

#### 场景 C: 多个 ZIP 协同

```
ZIP 1: cube_with_materials_notexture.zip
  内容: cube_with_materials.obj, cube_with_materials.mtl

ZIP 2: textures.zip
  内容: cube_texture.png

步骤: 同时拖入两个 ZIP

执行流程:
  1. LoadFiles: fileList = [ZIP 1, ZIP 2]
  2. DecompressArchives:
     - 解压 ZIP 1: 添加 .obj, .mtl
     - 解压 ZIP 2: 添加 .png
  3. fileList 包含所有 5 个文件 (2 个 ZIP + 3 个解压文件)
  4. 导入 .obj 时:
     - 访问 .mtl → 找到（来自 ZIP 1）
     - 访问 .png → 找到（来自 ZIP 2）

结果:
  usedFiles = ['cube_with_materials.obj', 'cube_with_materials.mtl', 'cube_texture.png']
  missingFiles = []
  ✓ 两个 ZIP 的内容正确协同
```

#### 场景 D: 同名文件冲突（边界问题）

```
ZIP 文件: conflict.zip
ZIP 内部结构:
  dir1/
    texture.png  (内容: 红色)
  dir2/
    texture.png  (内容: 蓝色)

步骤: 拖入 conflict.zip

执行流程:
  1. 解压时:
     - 'dir1/texture.png' → 'texture.png' (先添加)
     - 'dir2/texture.png' → 'texture.png' (后添加)
  2. fileList 中有两个名为 'texture.png' 的文件
  3. FindFileByPath('texture.png'):
     - 顺序遍历
     - 返回第一个（dir1/texture.png，红色）
  4. 第二个 texture.png（蓝色）永远无法被访问

结果:
  ⚠️ 只有第一个 texture.png 会被使用
  ⚠️ 第二个同名文件"消失"了
```

---

## 问题三：运行时扩展导入器的边界行为

### 结论

**运行时扩展导入器（`AddImporter`）的行为由数组顺序和首次匹配规则决定**。

#### 核心规则

| 特性 | 行为 |
|------|------|
| 优先级 | 新导入器被**追加到末尾**，优先级最低 |
| 匹配规则 | 顺序遍历，**第一个匹配即返回** |
| 扩展名冲突 | 新导入器支持的扩展名如果已被占用，**永远不会被匹配** |
| 部分冲突 | 支持多扩展名的导入器，**未被占用的扩展名可以使用** |
| 撤销能力 | **无法撤销**，没有 `RemoveImporter` 方法 |
| 生效时机 | **即时生效**，添加后立即影响后续导入 |

#### 关键发现

> ⚠️ **设计意图推测**: `AddImporter` 可能是为了支持**全新的文件格式**，而不是**替换/增强现有格式**。如果你想增强 `.obj` 的解析能力，`AddImporter` 无法实现。

---

### 证据

#### 证据 1: AddImporter 实现

**文件位置**: `source/engine/import/importer.js:107-110`

```javascript
AddImporter (importer)
{
    this.importers.push(importer);  // 追加到数组末尾
}
```

**分析**:
- 没有任何参数控制插入位置
- 总是追加到末尾
- 没有对应的 `RemoveImporter`

#### 证据 2: GetImportableFiles 匹配顺序

**文件位置**: `source/engine/import/importer.js:289-315`

```javascript
GetImportableFiles (fileList)
{
    function FindImporter (file, importers)
    {
        // 顺序遍历 importers 数组
        for (let importerIndex = 0; importerIndex < importers.length; importerIndex++) {
            let importer = importers[importerIndex];
            // 检查是否支持该扩展名
            if (importer.CanImportExtension(file.extension)) {
                return importer;  // ⚠️ 第一个匹配即返回
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

**分析**:
- `FindImporter` 按数组顺序遍历
- **第一个**返回 `CanImportExtension(extension) === true` 的导入器
- 后面的导入器即使也支持该扩展名，也没有机会

#### 证据 3: 默认导入器注册顺序

**文件位置**: `source/engine/import/importer.js:83-100`

```javascript
this.importers = [
    new ImporterObj(),        // #0: 支持 .obj
    new ImporterStl(),        // #1: 支持 .stl
    new ImporterOff(),        // #2: 支持 .off
    new ImporterPly(),        // #3: 支持 .ply
    new Importer3ds(),        // #4: 支持 .3ds
    new ImporterGltf(),       // #5: 支持 .gltf, .glb
    new ImporterBim(),        // #6: 支持 .bim
    new Importer3dm(),        // #7: 支持 .3dm
    new ImporterIfc(),        // #8: 支持 .ifc
    new ImporterOcct(),       // #9: 支持 .stp, .step, .igs, .iges, .brp, .brep
    new ImporterFcstd(),      // #10: 支持 .fcstd
    new ImporterThreeFbx(),   // #11: 支持 .fbx
    new ImporterThreeDae(),   // #12: 支持 .dae
    new ImporterThreeWrl(),   // #13: 支持 .wrl
    new ImporterThree3mf(),   // #14: 支持 .3mf
    new ImporterThreeAmf()    // #15: 支持 .amf
];
```

**分析**:
- 共 16 个默认导入器
- `AddImporter` 会添加到索引 16 及以后
- 索引越低，优先级越高

#### 证据 4: 导入器基类的 CanImportExtension

**文件位置**: `source/engine/import/importerbase.js`（所有导入器都必须实现）

```javascript
// 所有导入器都必须实现这个方法
CanImportExtension (extension)
{
    // 子类实现，返回 true/false
}
```

**各导入器的实现示例**:

| 导入器 | CanImportExtension 实现 | 支持的扩展名 |
|--------|------------------------|-------------|
| `ImporterObj` | `extension === 'obj'` | `obj` |
| `ImporterStl` | `extension === 'stl'` | `stl` |
| `ImporterGltf` | `extension === 'gltf' \|\| extension === 'glb'` | `gltf`, `glb` |
| `ImporterOcct` | 6 种扩展名检查 | `stp`, `step`, `igs`, `iges`, `brp`, `brep` |

---

### 可复现步骤

#### 场景 A: 新导入器支持全新扩展名（正常使用）

```
初始状态:
  importers = [
    #0: ImporterObj (.obj)
    #1: ImporterStl (.stl)
    ...
    #15: ImporterThreeAmf (.amf)
  ]

步骤:
  1. 创建新导入器:
     class MyImporterXyz extends ImporterBase {
         CanImportExtension(extension) {
             return extension === 'xyz';  // 全新扩展名
         }
         // ... 其他钩子实现 ...
     }
  2. importer.AddImporter(new MyImporterXyz());

结果状态:
  importers = [
    #0: ImporterObj (.obj)
    ...
    #15: ImporterThreeAmf (.amf)
    #16: MyImporterXyz (.xyz)  ← 新添加
  ]

测试: 拖入 test.xyz
  执行 FindImporter('xyz', importers):
    #0: ImporterObj.CanImportExtension('xyz')? → false
    #1: ImporterStl.CanImportExtension('xyz')? → false
    ...
    #15: ImporterThreeAmf.CanImportExtension('xyz')? → false
    #16: MyImporterXyz.CanImportExtension('xyz')? → true
    → 返回 MyImporterXyz
  
  ✓ 新导入器正常工作
```

#### 场景 B: 扩展名冲突（新导入器被忽略）

```
初始状态:
  importers[0] = ImporterObj (支持 .obj)

步骤:
  1. 创建"增强版"OBJ 导入器:
     class MyBetterObjImporter extends ImporterBase {
         CanImportExtension(extension) {
             return extension === 'obj';  // 冲突！
         }
         // ... 更好的解析逻辑 ...
     }
  2. importer.AddImporter(new MyBetterObjImporter());

结果状态:
  importers = [
    #0: ImporterObj (.obj)
    ...
    #16: MyBetterObjImporter (.obj)  ← 新添加，但冲突
  ]

测试: 拖入 test.obj
  执行 FindImporter('obj', importers):
    #0: ImporterObj.CanImportExtension('obj')? → true
    → 直接返回 ImporterObj
    ⚠️ #16 MyBetterObjImporter 永远不会被检查！

  ✗ 新导入器完全被忽略
```

#### 场景 C: 部分冲突（多扩展名导入器）

```
初始状态:
  ImporterObj 支持 .obj
  没有导入器支持 .xyz

步骤:
  1. 创建支持多扩展名的导入器:
     class MyComboImporter extends ImporterBase {
         CanImportExtension(extension) {
             return extension === 'obj' || extension === 'xyz';
         }
         // ...
     }
  2. importer.AddImporter(new MyComboImporter());

测试 1: 拖入 test.obj
  FindImporter('obj'):
    #0 ImporterObj 匹配 → 使用 ImporterObj
    ✗ MyComboImporter 的 .obj 分支被忽略

测试 2: 拖入 test.xyz
  FindImporter('xyz'):
    #0-#15 都不匹配
    #16 MyComboImporter 匹配 → 使用 MyComboImporter
    ✓ MyComboImporter 的 .xyz 分支正常工作
```

#### 场景 D: 无法撤销

```
步骤:
  1. importer.AddImporter(myImporter);
  2. // 后来后悔了，想移除？

结果:
  - 没有 RemoveImporter 方法
  - 没有其他方法可以修改 importers 数组
  - 只能创建新的 Importer 实例:
    let newImporter = new OV.Importer();  // 重新开始
```

---

## 总结

### 问题一核心结论

| 要点 | 结论 |
|------|------|
| 缺失记录重置 | 每次导入开始时 `missingFiles` 被清空，重新计算 |
| 文件列表扩展 | 需要**双条件**: 新文件不可导入 + 匹配之前的 `missingFiles` |
| 陷阱场景 | 拖入无关文件会导致 `fileList` 完全替换，之前的主文件丢失 |
| 两种使用模式 | 同一 Importer 实例支持扩展；每次新建 Importer 则无状态 |

### 问题二核心结论

| 要点 | 结论 |
|------|------|
| ZIP 追踪 | ZIP 本身不记录到 `usedFiles`，只记录解压后的文件 |
| 路径处理 | 目录被剥离，只保留文件名 |
| 多 ZIP 协同 | 多个 ZIP 的内容合并到同一 `fileList` |
| 边界问题 | 同名文件冲突时，只有第一个能被访问 |

### 问题三核心结论

| 要点 | 结论 |
|------|------|
| 优先级 | 新导入器追加到末尾，优先级最低 |
| 匹配规则 | 首次匹配即返回，不考虑后续导入器 |
| 冲突处理 | 扩展名被占用时，新导入器永远无法被匹配 |
| 设计意图 | 可能是为了支持**全新格式**，而不是增强现有格式 |
| 撤销能力 | 无法撤销，只能创建新实例 |

---

*报告生成时间: 2026-04-29*

*数据来源: 代码静态分析 + 官方测试用例验证*
