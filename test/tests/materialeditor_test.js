import * as assert from 'assert';
import * as OV from '../../source/engine/main.js';

export default function suite ()
{

describe ('Material Editor - Basic Tests', function () {
    it ('Physical Material Initialization', function () {
        let material = new OV.PhysicalMaterial ();
        assert.strictEqual (material.type, OV.MaterialType.Physical);
        assert.strictEqual (material.metalness, 0.0);
        assert.strictEqual (material.roughness, 1.0);
        assert.deepStrictEqual (material.color, new OV.RGBColor (0, 0, 0));
        assert.strictEqual (material.opacity, 1.0);
    });

    it ('Phong Material Initialization', function () {
        let material = new OV.PhongMaterial ();
        assert.strictEqual (material.type, OV.MaterialType.Phong);
        assert.deepStrictEqual (material.ambient, new OV.RGBColor (0, 0, 0));
        assert.deepStrictEqual (material.specular, new OV.RGBColor (0, 0, 0));
        assert.strictEqual (material.shininess, 0.0);
    });

    it ('Physical Material Parameter Modification', function () {
        let material = new OV.PhysicalMaterial ();

        material.color = new OV.RGBColor (255, 0, 0);
        assert.deepStrictEqual (material.color, new OV.RGBColor (255, 0, 0));

        material.metalness = 0.5;
        assert.strictEqual (material.metalness, 0.5);

        material.roughness = 0.3;
        assert.strictEqual (material.roughness, 0.3);

        material.opacity = 0.8;
        assert.strictEqual (material.opacity, 0.8);
        assert.strictEqual (material.transparent, false);

        material.transparent = true;
        assert.strictEqual (material.transparent, true);
    });

    it ('Phong Material Parameter Modification', function () {
        let material = new OV.PhongMaterial ();

        material.color = new OV.RGBColor (0, 255, 0);
        assert.deepStrictEqual (material.color, new OV.RGBColor (0, 255, 0));

        material.ambient = new OV.RGBColor (100, 100, 100);
        assert.deepStrictEqual (material.ambient, new OV.RGBColor (100, 100, 100));

        material.specular = new OV.RGBColor (200, 200, 200);
        assert.deepStrictEqual (material.specular, new OV.RGBColor (200, 200, 200));

        material.shininess = 50.0;
        assert.strictEqual (material.shininess, 50.0);

        material.opacity = 0.5;
        assert.strictEqual (material.opacity, 0.5);
    });

    it ('Model with Multiple Materials', function () {
        let model = new OV.Model ();

        let material1 = new OV.PhysicalMaterial ();
        material1.name = 'Red Material';
        material1.color = new OV.RGBColor (255, 0, 0);
        material1.metalness = 0.0;
        material1.roughness = 0.5;
        let matIndex1 = model.AddMaterial (material1);

        let material2 = new OV.PhysicalMaterial ();
        material2.name = 'Blue Material';
        material2.color = new OV.RGBColor (0, 0, 255);
        material2.metalness = 1.0;
        material2.roughness = 0.2;
        let matIndex2 = model.AddMaterial (material2);

        assert.strictEqual (model.MaterialCount (), 2);
        assert.strictEqual (model.GetMaterial (matIndex1).name, 'Red Material');
        assert.strictEqual (model.GetMaterial (matIndex2).name, 'Blue Material');
    });

    it ('Material IsEqual for Physical Material', function () {
        let material1 = new OV.PhysicalMaterial ();
        material1.color = new OV.RGBColor (255, 0, 0);
        material1.metalness = 0.5;
        material1.roughness = 0.3;
        material1.opacity = 0.8;

        let material2 = new OV.PhysicalMaterial ();
        material2.color = new OV.RGBColor (255, 0, 0);
        material2.metalness = 0.5;
        material2.roughness = 0.3;
        material2.opacity = 0.8;

        let material3 = new OV.PhysicalMaterial ();
        material3.color = new OV.RGBColor (0, 255, 0);
        material3.metalness = 0.5;
        material3.roughness = 0.3;
        material3.opacity = 0.8;

        assert.strictEqual (material1.IsEqual (material2), true);
        assert.strictEqual (material1.IsEqual (material3), false);
    });

    it ('Material IsEqual for Phong Material', function () {
        let material1 = new OV.PhongMaterial ();
        material1.color = new OV.RGBColor (255, 0, 0);
        material1.ambient = new OV.RGBColor (50, 50, 50);
        material1.specular = new OV.RGBColor (200, 200, 200);
        material1.shininess = 30.0;

        let material2 = new OV.PhongMaterial ();
        material2.color = new OV.RGBColor (255, 0, 0);
        material2.ambient = new OV.RGBColor (50, 50, 50);
        material2.specular = new OV.RGBColor (200, 200, 200);
        material2.shininess = 30.0;

        let material3 = new OV.PhongMaterial ();
        material3.color = new OV.RGBColor (255, 0, 0);
        material3.ambient = new OV.RGBColor (50, 50, 50);
        material3.specular = new OV.RGBColor (200, 200, 200);
        material3.shininess = 60.0;

        assert.strictEqual (material1.IsEqual (material2), true);
        assert.strictEqual (material1.IsEqual (material3), false);
    });

    it ('Physical vs Phong Material Type', function () {
        let physicalMaterial = new OV.PhysicalMaterial ();
        let phongMaterial = new OV.PhongMaterial ();

        assert.strictEqual (physicalMaterial.type, OV.MaterialType.Physical);
        assert.strictEqual (phongMaterial.type, OV.MaterialType.Phong);
        assert.strictEqual (physicalMaterial.IsEqual (phongMaterial), false);
    });

    it ('Material with Texture Maps', function () {
        let material = new OV.PhysicalMaterial ();

        let diffuseMap = new OV.TextureMap ();
        diffuseMap.name = 'diffuse.png';
        diffuseMap.mimeType = 'image/png';
        material.diffuseMap = diffuseMap;

        let normalMap = new OV.TextureMap ();
        normalMap.name = 'normal.png';
        normalMap.mimeType = 'image/png';
        material.normalMap = normalMap;

        assert.strictEqual (material.diffuseMap.name, 'diffuse.png');
        assert.strictEqual (material.normalMap.name, 'normal.png');
        assert.strictEqual (material.bumpMap, null);
    });

    it ('TextureMap Transformation', function () {
        let map = new OV.TextureMap ();

        map.offset = new OV.Coord2D (0.5, 0.5);
        map.scale = new OV.Coord2D (2.0, 2.0);
        map.rotation = Math.PI / 4;

        assert.deepStrictEqual (map.offset, new OV.Coord2D (0.5, 0.5));
        assert.deepStrictEqual (map.scale, new OV.Coord2D (2.0, 2.0));
        assert.strictEqual (map.rotation, Math.PI / 4);
        assert.strictEqual (map.HasTransformation (), true);
    });

    it ('TextureMapIsEqual', function () {
        let map1 = new OV.TextureMap ();
        map1.name = 'test.png';
        map1.mimeType = 'image/png';
        map1.offset = new OV.Coord2D (0.0, 0.0);
        map1.scale = new OV.Coord2D (1.0, 1.0);
        map1.rotation = 0.0;

        let map2 = new OV.TextureMap ();
        map2.name = 'test.png';
        map2.mimeType = 'image/png';
        map2.offset = new OV.Coord2D (0.0, 0.0);
        map2.scale = new OV.Coord2D (1.0, 1.0);
        map2.rotation = 0.0;

        let map3 = new OV.TextureMap ();
        map3.name = 'other.png';
        map3.mimeType = 'image/png';
        map3.offset = new OV.Coord2D (0.0, 0.0);
        map3.scale = new OV.Coord2D (1.0, 1.0);
        map3.rotation = 0.0;

        assert.strictEqual (OV.TextureMapIsEqual (map1, map2), true);
        assert.strictEqual (OV.TextureMapIsEqual (map1, map3), false);
    });

    it ('Null TextureMapIsEqual', function () {
        assert.strictEqual (OV.TextureMapIsEqual (null, null), true);
        assert.strictEqual (OV.TextureMapIsEqual (new OV.TextureMap (), null), false);
        assert.strictEqual (OV.TextureMapIsEqual (null, new OV.TextureMap ()), false);
    });

    it ('Material Source', function () {
        let material1 = new OV.PhysicalMaterial ();
        material1.source = OV.MaterialSource.Model;

        let material2 = new OV.PhysicalMaterial ();
        material2.source = OV.MaterialSource.DefaultFace;

        let material3 = new OV.PhysicalMaterial ();
        material3.source = OV.MaterialSource.DefaultLine;

        assert.strictEqual (material1.source, OV.MaterialSource.Model);
        assert.strictEqual (material2.source, OV.MaterialSource.DefaultFace);
        assert.strictEqual (material3.source, OV.MaterialSource.DefaultLine);
    });

    it ('Vertex Colors Material', function () {
        let material = new OV.PhysicalMaterial ();
        material.vertexColors = false;
        assert.strictEqual (material.vertexColors, false);

        material.vertexColors = true;
        assert.strictEqual (material.vertexColors, true);
    });

    it ('Emissive Color', function () {
        let material = new OV.PhysicalMaterial ();
        material.emissive = new OV.RGBColor (0, 0, 0);
        assert.deepStrictEqual (material.emissive, new OV.RGBColor (0, 0, 0));

        material.emissive = new OV.RGBColor (255, 100, 50);
        assert.deepStrictEqual (material.emissive, new OV.RGBColor (255, 100, 50));
    });

    it ('Alpha Test', function () {
        let material = new OV.PhysicalMaterial ();
        material.alphaTest = 0.0;
        assert.strictEqual (material.alphaTest, 0.0);

        material.alphaTest = 0.5;
        assert.strictEqual (material.alphaTest, 0.5);
    });

    it ('Multiply Diffuse Map', function () {
        let material = new OV.PhysicalMaterial ();
        material.multiplyDiffuseMap = false;
        assert.strictEqual (material.multiplyDiffuseMap, false);

        material.multiplyDiffuseMap = true;
        assert.strictEqual (material.multiplyDiffuseMap, true);
    });
});

describe ('Material Editor - Clone and Copy', function () {
    it ('Physical Material Clone', function () {
        let material = new OV.PhysicalMaterial ();
        material.name = 'Test Material';
        material.color = new OV.RGBColor (255, 100, 50);
        material.metalness = 0.5;
        material.roughness = 0.3;
        material.opacity = 0.8;
        material.emissive = new OV.RGBColor (100, 100, 100);

        let clone = material.Clone ();
        assert.strictEqual (clone.name, 'Test Material');
        assert.deepStrictEqual (clone.color, new OV.RGBColor (255, 100, 50));
        assert.strictEqual (clone.metalness, 0.5);
        assert.strictEqual (clone.roughness, 0.3);
        assert.strictEqual (clone.opacity, 0.8);
        assert.deepStrictEqual (clone.emissive, new OV.RGBColor (100, 100, 100));

        material.color = new OV.RGBColor (0, 0, 0);
        assert.deepStrictEqual (clone.color, new OV.RGBColor (255, 100, 50));
    });

    it ('Phong Material Clone', function () {
        let material = new OV.PhongMaterial ();
        material.name = 'Phong Test';
        material.color = new OV.RGBColor (200, 150, 100);
        material.ambient = new OV.RGBColor (50, 50, 50);
        material.specular = new OV.RGBColor (255, 255, 255);
        material.shininess = 0.6;
        material.opacity = 0.9;

        let clone = material.Clone ();
        assert.strictEqual (clone.name, 'Phong Test');
        assert.deepStrictEqual (clone.color, new OV.RGBColor (200, 150, 100));
        assert.deepStrictEqual (clone.ambient, new OV.RGBColor (50, 50, 50));
        assert.deepStrictEqual (clone.specular, new OV.RGBColor (255, 255, 255));
        assert.strictEqual (clone.shininess, 0.6);
        assert.strictEqual (clone.opacity, 0.9);
    });

    it ('CopyPropertiesTo', function () {
        let source = new OV.PhysicalMaterial ();
        source.name = 'Source';
        source.color = new OV.RGBColor (128, 128, 128);
        source.metalness = 0.7;
        source.roughness = 0.4;
        source.opacity = 0.5;
        source.transparent = true;

        let target = new OV.PhysicalMaterial ();
        source.CopyPropertiesTo (target);

        assert.strictEqual (target.name, 'Source');
        assert.deepStrictEqual (target.color, new OV.RGBColor (128, 128, 128));
        assert.strictEqual (target.metalness, 0.7);
        assert.strictEqual (target.roughness, 0.4);
        assert.strictEqual (target.opacity, 0.5);
        assert.strictEqual (target.transparent, true);
    });

    it ('Clone IsEqual', function () {
        let material = new OV.PhysicalMaterial ();
        material.name = 'Test';
        material.color = new OV.RGBColor (100, 150, 200);
        material.metalness = 0.3;
        material.roughness = 0.8;

        let clone = material.Clone ();
        assert.strictEqual (material.IsEqual (clone), true);

        clone.metalness = 0.9;
        assert.strictEqual (material.IsEqual (clone), false);
    });
});

describe ('Material History - Core Behavior', function () {
    it ('Initial State', function () {
        let history = new OV.MaterialHistory ();
        assert.strictEqual (history.CanUndo (), false);
        assert.strictEqual (history.CanRedo (), false);
        assert.strictEqual (history.UndoCount (), 0);
        assert.strictEqual (history.RedoCount (), 0);
    });

    it ('Push Single Entry', function () {
        let history = new OV.MaterialHistory ();
        let oldColor = new OV.RGBColor (255, 0, 0);
        let newColor = new OV.RGBColor (0, 255, 0);

        history.Push (0, OV.MaterialProperty.Color, oldColor, newColor);

        assert.strictEqual (history.CanUndo (), true);
        assert.strictEqual (history.CanRedo (), false);
        assert.strictEqual (history.UndoCount (), 1);
        assert.strictEqual (history.RedoCount (), 0);
    });

    it ('Push Multiple Entries', function () {
        let history = new OV.MaterialHistory ();

        history.Push (0, OV.MaterialProperty.Color, new OV.RGBColor (255, 0, 0), new OV.RGBColor (0, 255, 0));
        history.Push (0, OV.MaterialProperty.Metalness, 0.0, 0.5);
        history.Push (0, OV.MaterialProperty.Roughness, 1.0, 0.3);

        assert.strictEqual (history.CanUndo (), true);
        assert.strictEqual (history.CanRedo (), false);
        assert.strictEqual (history.UndoCount (), 3);
        assert.strictEqual (history.RedoCount (), 0);
    });

    it ('Undo Single Operation', function () {
        let history = new OV.MaterialHistory ();
        let oldColor = new OV.RGBColor (255, 0, 0);
        let newColor = new OV.RGBColor (0, 255, 0);

        history.Push (0, OV.MaterialProperty.Color, oldColor, newColor);

        let undoResult = history.Undo ();

        assert.notStrictEqual (undoResult, null);
        assert.strictEqual (undoResult.materialIndex, 0);
        assert.strictEqual (undoResult.property, OV.MaterialProperty.Color);
        assert.deepStrictEqual (undoResult.value, oldColor);

        assert.strictEqual (history.CanUndo (), false);
        assert.strictEqual (history.CanRedo (), true);
        assert.strictEqual (history.UndoCount (), 0);
        assert.strictEqual (history.RedoCount (), 1);
    });

    it ('Redo Single Operation', function () {
        let history = new OV.MaterialHistory ();
        let oldColor = new OV.RGBColor (255, 0, 0);
        let newColor = new OV.RGBColor (0, 255, 0);

        history.Push (0, OV.MaterialProperty.Color, oldColor, newColor);
        history.Undo ();

        let redoResult = history.Redo ();

        assert.notStrictEqual (redoResult, null);
        assert.strictEqual (redoResult.materialIndex, 0);
        assert.strictEqual (redoResult.property, OV.MaterialProperty.Color);
        assert.deepStrictEqual (redoResult.value, newColor);

        assert.strictEqual (history.CanUndo (), true);
        assert.strictEqual (history.CanRedo (), false);
        assert.strictEqual (history.UndoCount (), 1);
        assert.strictEqual (history.RedoCount (), 0);
    });

    it ('Undo Multiple Operations', function () {
        let history = new OV.MaterialHistory ();

        history.Push (0, OV.MaterialProperty.Color, new OV.RGBColor (255, 0, 0), new OV.RGBColor (0, 255, 0));
        history.Push (0, OV.MaterialProperty.Metalness, 0.0, 0.5);
        history.Push (0, OV.MaterialProperty.Roughness, 1.0, 0.3);

        assert.strictEqual (history.UndoCount (), 3);

        let undo1 = history.Undo ();
        assert.strictEqual (undo1.property, OV.MaterialProperty.Roughness);
        assert.strictEqual (history.UndoCount (), 2);
        assert.strictEqual (history.RedoCount (), 1);

        let undo2 = history.Undo ();
        assert.strictEqual (undo2.property, OV.MaterialProperty.Metalness);
        assert.strictEqual (history.UndoCount (), 1);
        assert.strictEqual (history.RedoCount (), 2);

        let undo3 = history.Undo ();
        assert.strictEqual (undo3.property, OV.MaterialProperty.Color);
        assert.strictEqual (history.UndoCount (), 0);
        assert.strictEqual (history.RedoCount (), 3);
    });

    it ('Redo Multiple Operations', function () {
        let history = new OV.MaterialHistory ();

        history.Push (0, OV.MaterialProperty.Color, new OV.RGBColor (255, 0, 0), new OV.RGBColor (0, 255, 0));
        history.Push (0, OV.MaterialProperty.Metalness, 0.0, 0.5);

        history.Undo ();
        history.Undo ();

        assert.strictEqual (history.UndoCount (), 0);
        assert.strictEqual (history.RedoCount (), 2);

        let redo1 = history.Redo ();
        assert.strictEqual (redo1.property, OV.MaterialProperty.Color);
        assert.strictEqual (history.UndoCount (), 1);
        assert.strictEqual (history.RedoCount (), 1);

        let redo2 = history.Redo ();
        assert.strictEqual (redo2.property, OV.MaterialProperty.Metalness);
        assert.strictEqual (history.UndoCount (), 2);
        assert.strictEqual (history.RedoCount (), 0);
    });

    it ('New Operation Clears Redo Stack', function () {
        let history = new OV.MaterialHistory ();

        history.Push (0, OV.MaterialProperty.Color, new OV.RGBColor (255, 0, 0), new OV.RGBColor (0, 255, 0));
        history.Push (0, OV.MaterialProperty.Metalness, 0.0, 0.5);

        history.Undo ();
        history.Undo ();

        assert.strictEqual (history.UndoCount (), 0);
        assert.strictEqual (history.RedoCount (), 2);

        history.Push (0, OV.MaterialProperty.Roughness, 1.0, 0.3);

        assert.strictEqual (history.UndoCount (), 1);
        assert.strictEqual (history.CanRedo (), false);
        assert.strictEqual (history.RedoCount (), 0);
    });

    it ('Undo on Empty Stack Returns Null', function () {
        let history = new OV.MaterialHistory ();
        let result = history.Undo ();
        assert.strictEqual (result, null);
    });

    it ('Redo on Empty Stack Returns Null', function () {
        let history = new OV.MaterialHistory ();
        let result = history.Redo ();
        assert.strictEqual (result, null);
    });

    it ('History Size Limit - Enforces 20 Steps Limit', function () {
        let history = new OV.MaterialHistory ();

        assert.strictEqual (history.GetMaxHistorySize (), 20);

        for (let i = 0; i < 30; i++) {
            history.Push (i % 5, OV.MaterialProperty.Metalness, 0.0, i / 100);
        }

        assert.strictEqual (history.UndoCount (), 20);
    });

    it ('History Size Limit - Oldest Entries are Removed', function () {
        let history = new OV.MaterialHistory ();

        for (let i = 0; i < 25; i++) {
            history.Push (0, OV.MaterialProperty.Opacity, 1.0, i * 0.01);
        }

        assert.strictEqual (history.UndoCount (), 20);

        for (let i = 0; i < 20; i++) {
            let undoResult = history.Undo ();
            assert.notStrictEqual (undoResult, null);
            let expectedValue = (24 - i) * 0.01;
            assert.strictEqual (undoResult.value, expectedValue);
        }

        assert.strictEqual (history.Undo (), null);
    });

    it ('Clear Resets All State', function () {
        let history = new OV.MaterialHistory ();

        history.Push (0, OV.MaterialProperty.Color, new OV.RGBColor (255, 0, 0), new OV.RGBColor (0, 255, 0));
        history.Push (0, OV.MaterialProperty.Metalness, 0.0, 0.5);
        history.Undo ();

        assert.strictEqual (history.UndoCount (), 1);
        assert.strictEqual (history.RedoCount (), 1);

        history.Clear ();

        assert.strictEqual (history.UndoCount (), 0);
        assert.strictEqual (history.RedoCount (), 0);
        assert.strictEqual (history.CanUndo (), false);
        assert.strictEqual (history.CanRedo (), false);
    });
});

describe ('Material History - Original Material Storage', function () {
    it ('Save and Get Original Material', function () {
        let history = new OV.MaterialHistory ();
        let material = new OV.PhysicalMaterial ();
        material.name = 'Original';
        material.color = new OV.RGBColor (100, 150, 200);
        material.metalness = 0.3;

        history.SaveOriginalMaterial (0, material);

        let saved = history.GetOriginalMaterial (0);
        assert.notStrictEqual (saved, null);
        assert.strictEqual (saved.name, 'Original');
        assert.deepStrictEqual (saved.color, new OV.RGBColor (100, 150, 200));
        assert.strictEqual (saved.metalness, 0.3);
    });

    it ('Original Material is a Clone', function () {
        let history = new OV.MaterialHistory ();
        let material = new OV.PhysicalMaterial ();
        material.name = 'Original';
        material.color = new OV.RGBColor (100, 150, 200);

        history.SaveOriginalMaterial (0, material);

        material.name = 'Modified';
        material.color = new OV.RGBColor (0, 0, 0);

        let saved = history.GetOriginalMaterial (0);
        assert.strictEqual (saved.name, 'Original');
        assert.deepStrictEqual (saved.color, new OV.RGBColor (100, 150, 200));
    });

    it ('HasOriginalMaterial', function () {
        let history = new OV.MaterialHistory ();

        assert.strictEqual (history.HasOriginalMaterial (0), false);
        assert.strictEqual (history.HasOriginalMaterial (1), false);

        let material = new OV.PhysicalMaterial ();
        history.SaveOriginalMaterial (0, material);

        assert.strictEqual (history.HasOriginalMaterial (0), true);
        assert.strictEqual (history.HasOriginalMaterial (1), false);
    });

    it ('Get Non-Existent Original Material Returns Null', function () {
        let history = new OV.MaterialHistory ();
        let result = history.GetOriginalMaterial (99);
        assert.strictEqual (result, null);
    });

    it ('Clear Removes All Original Materials', function () {
        let history = new OV.MaterialHistory ();

        let material1 = new OV.PhysicalMaterial ();
        let material2 = new OV.PhongMaterial ();

        history.SaveOriginalMaterial (0, material1);
        history.SaveOriginalMaterial (1, material2);

        assert.strictEqual (history.HasOriginalMaterial (0), true);
        assert.strictEqual (history.HasOriginalMaterial (1), true);

        history.Clear ();

        assert.strictEqual (history.HasOriginalMaterial (0), false);
        assert.strictEqual (history.HasOriginalMaterial (1), false);
    });
});

describe ('Material History - Value Cloning', function () {
    it ('RGBColor Values are Cloned', function () {
        let history = new OV.MaterialHistory ();
        let oldColor = new OV.RGBColor (255, 0, 0);
        let newColor = new OV.RGBColor (0, 255, 0);

        history.Push (0, OV.MaterialProperty.Color, oldColor, newColor);

        oldColor.r = 0;
        newColor.g = 0;

        let undoResult = history.Undo ();
        assert.strictEqual (undoResult.value.r, 255);
        assert.strictEqual (undoResult.value.g, 0);
        assert.strictEqual (undoResult.value.b, 0);

        history.Redo ();
        let redoResult = history.Undo ();
        history.Redo ();
    });

    it ('Numeric Values are Stored Correctly', function () {
        let history = new OV.MaterialHistory ();
        let oldValue = 0.0;
        let newValue = 0.5;

        history.Push (0, OV.MaterialProperty.Metalness, oldValue, newValue);

        let undoResult = history.Undo ();
        assert.strictEqual (undoResult.value, 0.0);

        let redoResult = history.Redo ();
        history.Undo ();
        redoResult = history.Redo ();
    });

    it ('Multiple Material Indices', function () {
        let history = new OV.MaterialHistory ();

        history.Push (0, OV.MaterialProperty.Color, new OV.RGBColor (255, 0, 0), new OV.RGBColor (0, 255, 0));
        history.Push (1, OV.MaterialProperty.Metalness, 0.0, 0.5);
        history.Push (0, OV.MaterialProperty.Roughness, 1.0, 0.3);

        assert.strictEqual (history.UndoCount (), 3);

        let undo1 = history.Undo ();
        assert.strictEqual (undo1.materialIndex, 0);
        assert.strictEqual (undo1.property, OV.MaterialProperty.Roughness);

        let undo2 = history.Undo ();
        assert.strictEqual (undo2.materialIndex, 1);
        assert.strictEqual (undo2.property, OV.MaterialProperty.Metalness);

        let undo3 = history.Undo ();
        assert.strictEqual (undo3.materialIndex, 0);
        assert.strictEqual (undo3.property, OV.MaterialProperty.Color);
    });
});

}
