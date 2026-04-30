import * as assert from 'assert';
import * as OV from '../../source/engine/main.js';

export default function suite ()
{

describe ('ClippingPlane', function () {
    it ('Default constructor', function () {
        let plane = new OV.ClippingPlane ();
        assert.strictEqual (plane.axis, OV.ClippingPlaneAxis.Z);
        assert.strictEqual (plane.offset, 0.0);
        assert.strictEqual (plane.invert, false);
        assert.ok (plane.GetThreePlane () !== null);
    });

    it ('Constructor with parameters', function () {
        let plane = new OV.ClippingPlane (OV.ClippingPlaneAxis.X, 5.0, true);
        assert.strictEqual (plane.axis, OV.ClippingPlaneAxis.X);
        assert.strictEqual (plane.offset, 5.0);
        assert.strictEqual (plane.invert, true);
    });

    it ('Clone', function () {
        let plane1 = new OV.ClippingPlane (OV.ClippingPlaneAxis.Y, 10.0, false);
        let plane2 = plane1.Clone ();
        assert.strictEqual (plane2.axis, OV.ClippingPlaneAxis.Y);
        assert.strictEqual (plane2.offset, 10.0);
        assert.strictEqual (plane2.invert, false);
    });

    it ('SetAxis', function () {
        let plane = new OV.ClippingPlane (OV.ClippingPlaneAxis.X, 0.0, false);
        plane.SetAxis (OV.ClippingPlaneAxis.Y);
        assert.strictEqual (plane.axis, OV.ClippingPlaneAxis.Y);
        plane.SetAxis (OV.ClippingPlaneAxis.Z);
        assert.strictEqual (plane.axis, OV.ClippingPlaneAxis.Z);
    });

    it ('SetOffset', function () {
        let plane = new OV.ClippingPlane (OV.ClippingPlaneAxis.Z, 0.0, false);
        plane.SetOffset (5.5);
        assert.strictEqual (plane.offset, 5.5);
    });

    it ('SetInvert', function () {
        let plane = new OV.ClippingPlane (OV.ClippingPlaneAxis.Z, 0.0, false);
        plane.SetInvert (true);
        assert.strictEqual (plane.invert, true);
        plane.SetInvert (false);
        assert.strictEqual (plane.invert, false);
    });
});

describe ('ClippingPlaneManager', function () {
    it ('Default constructor', function () {
        let manager = new OV.ClippingPlaneManager ();
        assert.strictEqual (manager.GetPlaneCount (), 0);
        assert.strictEqual (manager.IsEnabled (), true);
    });

    it ('SetEnabled', function () {
        let manager = new OV.ClippingPlaneManager ();
        manager.SetEnabled (false);
        assert.strictEqual (manager.IsEnabled (), false);
        manager.SetEnabled (true);
        assert.strictEqual (manager.IsEnabled (), true);
    });

    it ('AddPlane', function () {
        let manager = new OV.ClippingPlaneManager ();
        let index1 = manager.AddPlane (OV.ClippingPlaneAxis.X, 1.0, false);
        assert.strictEqual (index1, 0);
        assert.strictEqual (manager.GetPlaneCount (), 1);

        let index2 = manager.AddPlane (OV.ClippingPlaneAxis.Y, 2.0, true);
        assert.strictEqual (index2, 1);
        assert.strictEqual (manager.GetPlaneCount (), 2);
    });

    it ('GetPlane', function () {
        let manager = new OV.ClippingPlaneManager ();
        assert.strictEqual (manager.GetPlane (0), null);

        manager.AddPlane (OV.ClippingPlaneAxis.X, 5.0, false);
        let plane = manager.GetPlane (0);
        assert.ok (plane !== null);
        assert.strictEqual (plane.axis, OV.ClippingPlaneAxis.X);
        assert.strictEqual (plane.offset, 5.0);
        assert.strictEqual (plane.invert, false);
    });

    it ('RemovePlane', function () {
        let manager = new OV.ClippingPlaneManager ();
        manager.AddPlane (OV.ClippingPlaneAxis.X, 1.0, false);
        manager.AddPlane (OV.ClippingPlaneAxis.Y, 2.0, false);
        manager.AddPlane (OV.ClippingPlaneAxis.Z, 3.0, false);

        assert.strictEqual (manager.GetPlaneCount (), 3);

        let result = manager.RemovePlane (1);
        assert.strictEqual (result, true);
        assert.strictEqual (manager.GetPlaneCount (), 2);

        let plane0 = manager.GetPlane (0);
        let plane1 = manager.GetPlane (1);
        assert.strictEqual (plane0.axis, OV.ClippingPlaneAxis.X);
        assert.strictEqual (plane1.axis, OV.ClippingPlaneAxis.Z);

        result = manager.RemovePlane (10);
        assert.strictEqual (result, false);
    });

    it ('RemoveAllPlanes', function () {
        let manager = new OV.ClippingPlaneManager ();
        manager.AddPlane (OV.ClippingPlaneAxis.X, 1.0, false);
        manager.AddPlane (OV.ClippingPlaneAxis.Y, 2.0, false);
        assert.strictEqual (manager.GetPlaneCount (), 2);

        manager.RemoveAllPlanes ();
        assert.strictEqual (manager.GetPlaneCount (), 0);
    });

    it ('UpdatePlane', function () {
        let manager = new OV.ClippingPlaneManager ();
        manager.AddPlane (OV.ClippingPlaneAxis.X, 1.0, false);

        let result = manager.UpdatePlane (0, OV.ClippingPlaneAxis.Y, 5.0, true);
        assert.strictEqual (result, true);

        let plane = manager.GetPlane (0);
        assert.strictEqual (plane.axis, OV.ClippingPlaneAxis.Y);
        assert.strictEqual (plane.offset, 5.0);
        assert.strictEqual (plane.invert, true);

        result = manager.UpdatePlane (10, null, null, null);
        assert.strictEqual (result, false);
    });

    it ('GetThreePlanes when enabled', function () {
        let manager = new OV.ClippingPlaneManager ();
        manager.AddPlane (OV.ClippingPlaneAxis.X, 1.0, false);
        manager.AddPlane (OV.ClippingPlaneAxis.Y, 2.0, false);

        let threePlanes = manager.GetThreePlanes ();
        assert.strictEqual (threePlanes.length, 2);
    });

    it ('GetThreePlanes when disabled', function () {
        let manager = new OV.ClippingPlaneManager ();
        manager.AddPlane (OV.ClippingPlaneAxis.X, 1.0, false);
        manager.SetEnabled (false);

        let threePlanes = manager.GetThreePlanes ();
        assert.strictEqual (threePlanes.length, 0);
    });

    it ('Reset', function () {
        let manager = new OV.ClippingPlaneManager ();
        manager.AddPlane (OV.ClippingPlaneAxis.X, 1.0, false);
        manager.AddPlane (OV.ClippingPlaneAxis.Y, 2.0, false);
        manager.SetEnabled (false);

        manager.Reset ();
        assert.strictEqual (manager.GetPlaneCount (), 0);
        assert.strictEqual (manager.IsEnabled (), true);
    });
});

}
