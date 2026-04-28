import * as assert from 'assert';
import * as OV from '../../source/engine/main.js';

export default function suite ()
{

describe ('Measure Tool - Distance Calculation', function () {
    it ('Zero Distance (Same Point)', function () {
        const a = new OV.Coord3D (0.0, 0.0, 0.0);
        const b = new OV.Coord3D (0.0, 0.0, 0.0);
        const distance = OV.CoordDistance3D (a, b);
        assert.ok (OV.IsEqual (distance, 0.0));
    });

    it ('Distance Along X Axis', function () {
        const a = new OV.Coord3D (0.0, 0.0, 0.0);
        const b = new OV.Coord3D (5.0, 0.0, 0.0);
        const distance = OV.CoordDistance3D (a, b);
        assert.ok (OV.IsEqual (distance, 5.0));
    });

    it ('Distance Along Y Axis', function () {
        const a = new OV.Coord3D (0.0, 0.0, 0.0);
        const b = new OV.Coord3D (0.0, 3.0, 0.0);
        const distance = OV.CoordDistance3D (a, b);
        assert.ok (OV.IsEqual (distance, 3.0));
    });

    it ('Distance Along Z Axis', function () {
        const a = new OV.Coord3D (0.0, 0.0, 0.0);
        const b = new OV.Coord3D (0.0, 0.0, 4.0);
        const distance = OV.CoordDistance3D (a, b);
        assert.ok (OV.IsEqual (distance, 4.0));
    });

    it ('Distance - 3D Diagonal', function () {
        const a = new OV.Coord3D (0.0, 0.0, 0.0);
        const b = new OV.Coord3D (3.0, 4.0, 0.0);
        const distance = OV.CoordDistance3D (a, b);
        assert.ok (OV.IsEqual (distance, 5.0));
    });

    it ('Distance - Arbitrary Points', function () {
        const a = new OV.Coord3D (1.0, 2.0, 3.0);
        const b = new OV.Coord3D (4.0, 6.0, 8.0);
        const dx = 4.0 - 1.0;
        const dy = 6.0 - 2.0;
        const dz = 8.0 - 3.0;
        const expectedDistance = Math.sqrt (dx * dx + dy * dy + dz * dz);
        const distance = OV.CoordDistance3D (a, b);
        assert.ok (OV.IsEqual (distance, expectedDistance));
    });

    it ('Distance - Negative Coordinates', function () {
        const a = new OV.Coord3D (-1.0, -2.0, -3.0);
        const b = new OV.Coord3D (-4.0, -6.0, -8.0);
        const dx = -4.0 - (-1.0);
        const dy = -6.0 - (-2.0);
        const dz = -8.0 - (-3.0);
        const expectedDistance = Math.sqrt (dx * dx + dy * dy + dz * dz);
        const distance = OV.CoordDistance3D (a, b);
        assert.ok (OV.IsEqual (distance, expectedDistance));
    });

    it ('Distance - Commutative', function () {
        const a = new OV.Coord3D (1.0, 2.0, 3.0);
        const b = new OV.Coord3D (4.0, 5.0, 6.0);
        const distance1 = OV.CoordDistance3D (a, b);
        const distance2 = OV.CoordDistance3D (b, a);
        assert.ok (OV.IsEqual (distance1, distance2));
    });
});

describe ('Measure Tool - Angle Calculation', function () {
    it ('Zero Degree Angle (Same Direction)', function () {
        const a = new OV.Coord3D (1.0, 0.0, 0.0);
        const b = new OV.Coord3D (2.0, 0.0, 0.0);
        const angle = OV.VectorAngle3D (a, b);
        assert.ok (OV.IsEqual (angle, 0.0));
    });

    it ('90 Degree Angle - XY Plane', function () {
        const a = new OV.Coord3D (1.0, 0.0, 0.0);
        const b = new OV.Coord3D (0.0, 1.0, 0.0);
        const angle = OV.VectorAngle3D (a, b);
        const expectedAngle = Math.PI / 2.0;
        assert.ok (OV.IsEqual (angle, expectedAngle));
    });

    it ('90 Degree Angle - XZ Plane', function () {
        const a = new OV.Coord3D (1.0, 0.0, 0.0);
        const b = new OV.Coord3D (0.0, 0.0, 1.0);
        const angle = OV.VectorAngle3D (a, b);
        const expectedAngle = Math.PI / 2.0;
        assert.ok (OV.IsEqual (angle, expectedAngle));
    });

    it ('90 Degree Angle - YZ Plane', function () {
        const a = new OV.Coord3D (0.0, 1.0, 0.0);
        const b = new OV.Coord3D (0.0, 0.0, 1.0);
        const angle = OV.VectorAngle3D (a, b);
        const expectedAngle = Math.PI / 2.0;
        assert.ok (OV.IsEqual (angle, expectedAngle));
    });

    it ('180 Degree Angle (Opposite Direction)', function () {
        const a = new OV.Coord3D (1.0, 0.0, 0.0);
        const b = new OV.Coord3D (-1.0, 0.0, 0.0);
        const angle = OV.VectorAngle3D (a, b);
        const expectedAngle = Math.PI;
        assert.ok (OV.IsEqual (angle, expectedAngle));
    });

    it ('45 Degree Angle', function () {
        const a = new OV.Coord3D (1.0, 0.0, 0.0);
        const b = new OV.Coord3D (1.0, 1.0, 0.0);
        const angle = OV.VectorAngle3D (a, b);
        const expectedAngle = Math.PI / 4.0;
        assert.ok (OV.IsEqual (angle, expectedAngle));
    });

    it ('60 Degree Angle', function () {
        const a = new OV.Coord3D (1.0, 0.0, 0.0);
        const b = new OV.Coord3D (1.0, Math.sqrt (3.0), 0.0);
        const angle = OV.VectorAngle3D (a, b);
        const expectedAngle = Math.PI / 3.0;
        assert.ok (OV.IsEqual (angle, expectedAngle));
    });

    it ('30 Degree Angle', function () {
        const a = new OV.Coord3D (Math.sqrt (3.0), 1.0, 0.0);
        const b = new OV.Coord3D (1.0, 0.0, 0.0);
        const angle = OV.VectorAngle3D (a, b);
        const expectedAngle = Math.PI / 6.0;
        assert.ok (OV.IsEqual (angle, expectedAngle));
    });

    it ('Angle - Commutative', function () {
        const a = new OV.Coord3D (1.0, 2.0, 3.0);
        const b = new OV.Coord3D (4.0, 5.0, 6.0);
        const angle1 = OV.VectorAngle3D (a, b);
        const angle2 = OV.VectorAngle3D (b, a);
        assert.ok (OV.IsEqual (angle1, angle2));
    });

    it ('Angle - From Three Points (90 degrees)', function () {
        const vertex = new OV.Coord3D (0.0, 0.0, 0.0);
        const point1 = new OV.Coord3D (1.0, 0.0, 0.0);
        const point2 = new OV.Coord3D (0.0, 1.0, 0.0);

        const vector1 = OV.SubCoord3D (point1, vertex);
        const vector2 = OV.SubCoord3D (point2, vertex);

        const angle = OV.VectorAngle3D (vector1, vector2);
        const expectedAngle = Math.PI / 2.0;

        assert.ok (OV.IsEqual (angle, expectedAngle));
    });

    it ('Angle - From Three Points (45 degrees)', function () {
        const vertex = new OV.Coord3D (0.0, 0.0, 0.0);
        const point1 = new OV.Coord3D (2.0, 0.0, 0.0);
        const point2 = new OV.Coord3D (2.0, 2.0, 0.0);

        const vector1 = OV.SubCoord3D (point1, vertex);
        const vector2 = OV.SubCoord3D (point2, vertex);

        const angle = OV.VectorAngle3D (vector1, vector2);
        const expectedAngle = Math.PI / 4.0;

        assert.ok (OV.IsEqual (angle, expectedAngle));
    });

    it ('Angle - From Three Points (0 degrees)', function () {
        const vertex = new OV.Coord3D (0.0, 0.0, 0.0);
        const point1 = new OV.Coord3D (1.0, 0.0, 0.0);
        const point2 = new OV.Coord3D (3.0, 0.0, 0.0);

        const vector1 = OV.SubCoord3D (point1, vertex);
        const vector2 = OV.SubCoord3D (point2, vertex);

        const angle = OV.VectorAngle3D (vector1, vector2);

        assert.ok (OV.IsEqual (angle, 0.0));
    });

    it ('Angle - From Three Points (180 degrees)', function () {
        const vertex = new OV.Coord3D (0.0, 0.0, 0.0);
        const point1 = new OV.Coord3D (1.0, 0.0, 0.0);
        const point2 = new OV.Coord3D (-2.0, 0.0, 0.0);

        const vector1 = OV.SubCoord3D (point1, vertex);
        const vector2 = OV.SubCoord3D (point2, vertex);

        const angle = OV.VectorAngle3D (vector1, vector2);
        const expectedAngle = Math.PI;

        assert.ok (OV.IsEqual (angle, expectedAngle));
    });
});

}
