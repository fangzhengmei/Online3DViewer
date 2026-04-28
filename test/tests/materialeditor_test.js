import * as assert from 'assert';
import * as OV from '../../source/engine/main.js';

export default function suite ()
{

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
