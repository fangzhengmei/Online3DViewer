import { RGBColor } from '../engine/model/color.js';

export const MaterialProperty =
{
    Color : 'color',
    Metalness : 'metalness',
    Roughness : 'roughness',
    Opacity : 'opacity',
    Specular : 'specular',
    Shininess : 'shininess',
    Emissive : 'emissive',
    Ambient : 'ambient'
};

const MAX_HISTORY_SIZE = 20;

function CloneValue (value)
{
    if (value === null || value === undefined) {
        return value;
    }
    if (value instanceof RGBColor) {
        return value.Clone ();
    }
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
        return value;
    }
    if (Array.isArray (value)) {
        return value.slice ();
    }
    return value;
}

export class MaterialHistory
{
    constructor ()
    {
        this.undoStack = [];
        this.redoStack = [];
        this.originalMaterials = new Map ();
    }

    Clear ()
    {
        this.undoStack = [];
        this.redoStack = [];
        this.originalMaterials.clear ();
    }

    SaveOriginalMaterial (materialIndex, material)
    {
        this.originalMaterials.set (materialIndex, material.Clone ());
    }

    GetOriginalMaterial (materialIndex)
    {
        return this.originalMaterials.get (materialIndex) || null;
    }

    HasOriginalMaterial (materialIndex)
    {
        return this.originalMaterials.has (materialIndex);
    }

    Push (materialIndex, property, oldValue, newValue)
    {
        if (this.redoStack.length > 0) {
            this.redoStack = [];
        }

        let entry = {
            materialIndex : materialIndex,
            property : property,
            oldValue : CloneValue (oldValue),
            newValue : CloneValue (newValue)
        };

        this.undoStack.push (entry);

        if (this.undoStack.length > MAX_HISTORY_SIZE) {
            this.undoStack.shift ();
        }
    }

    CanUndo ()
    {
        return this.undoStack.length > 0;
    }

    CanRedo ()
    {
        return this.redoStack.length > 0;
    }

    Undo ()
    {
        if (!this.CanUndo ()) {
            return null;
        }
        let entry = this.undoStack.pop ();
        this.redoStack.push (entry);
        return {
            materialIndex : entry.materialIndex,
            property : entry.property,
            value : CloneValue (entry.oldValue)
        };
    }

    Redo ()
    {
        if (!this.CanRedo ()) {
            return null;
        }
        let entry = this.redoStack.pop ();
        this.undoStack.push (entry);
        return {
            materialIndex : entry.materialIndex,
            property : entry.property,
            value : CloneValue (entry.newValue)
        };
    }

    UndoCount ()
    {
        return this.undoStack.length;
    }

    RedoCount ()
    {
        return this.redoStack.length;
    }
}
