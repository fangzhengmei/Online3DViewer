import { CoordIsEqual3D } from '../geometry/coord3d.js';
import { IsEqual } from '../geometry/geometry.js';

/**
 * Camera navigation mode.
 * @enum
 */
export const NavigationMode =
{
    /** Fixed up vector. */
	FixedUpVector : 1,
    /** Free orbit. */
	FreeOrbit : 2
};

/**
 * Camera view presets.
 * @enum
 */
export const ViewPreset =
{
    /** Top view (looking down along Y axis, up is Z). */
	Top : 1,
    /** Bottom view (looking up along Y axis, up is Z). */
	Bottom : 2,
    /** Front view (looking along Z axis, up is Y). */
	Front : 3,
    /** Back view (looking along -Z axis, up is Y). */
	Back : 4,
    /** Left view (looking along X axis, up is Y). */
	Left : 5,
    /** Right view (looking along -X axis, up is Y). */
	Right : 6,
    /** Isometric view. */
	Isometric : 7
};

/**
 * Camera projection mode.
 * @enum
 */
export const ProjectionMode =
{
    /** Perspective projection. */
	Perspective : 1,
    /** Orthographic projection. */
	Orthographic : 2
};

/**
 * Camera object.
 */
export class Camera
{
    /**
     * @param {Coord3D} eye Eye position.
     * @param {Coord3D} center Center position. Sometimes it's called target or look at position.
     * @param {Coord3D} up Up vector.
     * @param {number} fov Field of view in degrees.
     */
    constructor (eye, center, up, fov)
    {
        this.eye = eye;
        this.center = center;
        this.up = up;
        this.fov = fov;
    }

    /**
     * Creates a clone of the object.
     * @returns {Camera}
     */
    Clone ()
    {
        return new Camera (
            this.eye.Clone (),
            this.center.Clone (),
            this.up.Clone (),
            this.fov
        );
    }
}

export function CameraIsEqual3D (a, b)
{
	return CoordIsEqual3D (a.eye, b.eye) && CoordIsEqual3D (a.center, b.center) && CoordIsEqual3D (a.up, b.up) && IsEqual (a.fov, b.fov);
}
