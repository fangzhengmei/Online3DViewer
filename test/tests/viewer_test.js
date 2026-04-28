import * as assert from 'assert';
import * as OV from '../../source/engine/main.js';

export default function suite ()
{

describe ('ViewPreset', function () {
    it ('Enum Definition', function () {
        assert.strictEqual (OV.ViewPreset.Top, 1);
        assert.strictEqual (OV.ViewPreset.Bottom, 2);
        assert.strictEqual (OV.ViewPreset.Front, 3);
        assert.strictEqual (OV.ViewPreset.Back, 4);
        assert.strictEqual (OV.ViewPreset.Left, 5);
        assert.strictEqual (OV.ViewPreset.Right, 6);
        assert.strictEqual (OV.ViewPreset.Isometric, 7);
    });
});

describe ('GetViewPresetCamera', function () {
    it ('Null Current Camera', function () {
        let result = OV.GetViewPresetCamera (null, OV.ViewPreset.Front, null);
        assert.strictEqual (result, null);
    });

    it ('Invalid View Preset', function () {
        let camera = new OV.Camera (
            new OV.Coord3D (0.0, 0.0, 10.0),
            new OV.Coord3D (0.0, 0.0, 0.0),
            new OV.Coord3D (0.0, 1.0, 0.0),
            45.0
        );
        let result = OV.GetViewPresetCamera (camera, 999, null);
        assert.strictEqual (result, null);
    });

    it ('Top View', function () {
        let camera = new OV.Camera (
            new OV.Coord3D (0.0, 0.0, 10.0),
            new OV.Coord3D (0.0, 0.0, 0.0),
            new OV.Coord3D (0.0, 1.0, 0.0),
            45.0
        );
        let result = OV.GetViewPresetCamera (camera, OV.ViewPreset.Top, null);
        assert.ok (result !== null);
        assert.ok (OV.CoordIsEqual3D (result.center, new OV.Coord3D (0.0, 0.0, 0.0)));
        assert.ok (OV.CoordIsEqual3D (result.up, new OV.Coord3D (0.0, 0.0, 1.0)));
        assert.strictEqual (result.eye.x, 0.0);
        assert.strictEqual (result.eye.z, 0.0);
        assert.ok (OV.IsGreater (result.eye.y, 0.0));
    });

    it ('Bottom View', function () {
        let camera = new OV.Camera (
            new OV.Coord3D (0.0, 0.0, 10.0),
            new OV.Coord3D (0.0, 0.0, 0.0),
            new OV.Coord3D (0.0, 1.0, 0.0),
            45.0
        );
        let result = OV.GetViewPresetCamera (camera, OV.ViewPreset.Bottom, null);
        assert.ok (result !== null);
        assert.ok (OV.CoordIsEqual3D (result.center, new OV.Coord3D (0.0, 0.0, 0.0)));
        assert.ok (OV.CoordIsEqual3D (result.up, new OV.Coord3D (0.0, 0.0, -1.0)));
        assert.strictEqual (result.eye.x, 0.0);
        assert.strictEqual (result.eye.z, 0.0);
        assert.ok (OV.IsLower (result.eye.y, 0.0));
    });

    it ('Front View', function () {
        let camera = new OV.Camera (
            new OV.Coord3D (0.0, 0.0, 10.0),
            new OV.Coord3D (0.0, 0.0, 0.0),
            new OV.Coord3D (0.0, 1.0, 0.0),
            45.0
        );
        let result = OV.GetViewPresetCamera (camera, OV.ViewPreset.Front, null);
        assert.ok (result !== null);
        assert.ok (OV.CoordIsEqual3D (result.center, new OV.Coord3D (0.0, 0.0, 0.0)));
        assert.ok (OV.CoordIsEqual3D (result.up, new OV.Coord3D (0.0, 1.0, 0.0)));
        assert.strictEqual (result.eye.x, 0.0);
        assert.strictEqual (result.eye.y, 0.0);
        assert.ok (OV.IsGreater (result.eye.z, 0.0));
    });

    it ('Back View', function () {
        let camera = new OV.Camera (
            new OV.Coord3D (0.0, 0.0, 10.0),
            new OV.Coord3D (0.0, 0.0, 0.0),
            new OV.Coord3D (0.0, 1.0, 0.0),
            45.0
        );
        let result = OV.GetViewPresetCamera (camera, OV.ViewPreset.Back, null);
        assert.ok (result !== null);
        assert.ok (OV.CoordIsEqual3D (result.center, new OV.Coord3D (0.0, 0.0, 0.0)));
        assert.ok (OV.CoordIsEqual3D (result.up, new OV.Coord3D (0.0, 1.0, 0.0)));
        assert.strictEqual (result.eye.x, 0.0);
        assert.strictEqual (result.eye.y, 0.0);
        assert.ok (OV.IsLower (result.eye.z, 0.0));
    });

    it ('Left View', function () {
        let camera = new OV.Camera (
            new OV.Coord3D (0.0, 0.0, 10.0),
            new OV.Coord3D (0.0, 0.0, 0.0),
            new OV.Coord3D (0.0, 1.0, 0.0),
            45.0
        );
        let result = OV.GetViewPresetCamera (camera, OV.ViewPreset.Left, null);
        assert.ok (result !== null);
        assert.ok (OV.CoordIsEqual3D (result.center, new OV.Coord3D (0.0, 0.0, 0.0)));
        assert.ok (OV.CoordIsEqual3D (result.up, new OV.Coord3D (0.0, 1.0, 0.0)));
        assert.strictEqual (result.eye.y, 0.0);
        assert.strictEqual (result.eye.z, 0.0);
        assert.ok (OV.IsLower (result.eye.x, 0.0));
    });

    it ('Right View', function () {
        let camera = new OV.Camera (
            new OV.Coord3D (0.0, 0.0, 10.0),
            new OV.Coord3D (0.0, 0.0, 0.0),
            new OV.Coord3D (0.0, 1.0, 0.0),
            45.0
        );
        let result = OV.GetViewPresetCamera (camera, OV.ViewPreset.Right, null);
        assert.ok (result !== null);
        assert.ok (OV.CoordIsEqual3D (result.center, new OV.Coord3D (0.0, 0.0, 0.0)));
        assert.ok (OV.CoordIsEqual3D (result.up, new OV.Coord3D (0.0, 1.0, 0.0)));
        assert.strictEqual (result.eye.y, 0.0);
        assert.strictEqual (result.eye.z, 0.0);
        assert.ok (OV.IsGreater (result.eye.x, 0.0));
    });

    it ('Isometric View', function () {
        let camera = new OV.Camera (
            new OV.Coord3D (0.0, 0.0, 10.0),
            new OV.Coord3D (0.0, 0.0, 0.0),
            new OV.Coord3D (0.0, 1.0, 0.0),
            45.0
        );
        let result = OV.GetViewPresetCamera (camera, OV.ViewPreset.Isometric, null);
        assert.ok (result !== null);
        assert.ok (OV.CoordIsEqual3D (result.center, new OV.Coord3D (0.0, 0.0, 0.0)));
        assert.ok (OV.CoordIsEqual3D (result.up, new OV.Coord3D (0.0, 1.0, 0.0)));
        assert.ok (OV.IsGreater (result.eye.x, 0.0));
        assert.ok (OV.IsGreater (result.eye.y, 0.0));
        assert.ok (OV.IsGreater (result.eye.z, 0.0));
        assert.ok (OV.IsEqual (result.eye.x, result.eye.y));
        assert.ok (OV.IsEqual (result.eye.y, result.eye.z));
    });

    it ('With Bounding Sphere', function () {
        let camera = new OV.Camera (
            new OV.Coord3D (0.0, 0.0, 10.0),
            new OV.Coord3D (0.0, 0.0, 0.0),
            new OV.Coord3D (0.0, 1.0, 0.0),
            45.0
        );
        let boundingSphere = {
            center : { x : 5.0, y : 5.0, z : 5.0 },
            radius : 10.0
        };
        let result = OV.GetViewPresetCamera (camera, OV.ViewPreset.Front, boundingSphere);
        assert.ok (result !== null);
        assert.ok (OV.CoordIsEqual3D (result.center, new OV.Coord3D (5.0, 5.0, 5.0)));
        assert.strictEqual (result.eye.x, 5.0);
        assert.strictEqual (result.eye.y, 5.0);
    });
});

}
