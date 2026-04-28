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

}
