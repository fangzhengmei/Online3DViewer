import { Direction } from '../geometry/geometry.js';
import { Model } from '../model/model.js';
import { FinalizeModel } from '../model/modelfinalization.js';
import { IsModelEmpty } from '../model/modelutils.js';
import { Loc } from '../core/localization.js';

export class ImporterBase
{
    constructor ()
    {
        this.name = null;
        this.extension = null;
        this.callbacks = null;
        this.model = null;
        this.error = null;
        this.message = null;
    }

    Import (name, extension, content, callbacks)
    {
        this.Clear ();

        this.name = name;
        this.extension = extension;
        this.callbacks = callbacks;
        this.model = new Model ();
        this.error = false;
        this.message = null;
        this.ResetContent ();
        this.ImportContent (content, () => {
            this.CreateResult (callbacks);
        });
    }

    Clear ()
    {
        this.name = null;
        this.extension = null;
        this.callbacks = null;
        this.model = null;
        this.error = null;
        this.message = null;
        this.ClearContent ();
    }

    CreateResult (callbacks)
    {
        if (this.error) {
            callbacks.onError ();
            callbacks.onComplete ();
            return;
        }

        if (IsModelEmpty (this.model)) {
            this.SetError (this.GetModelEmptyErrorMessage ());
            callbacks.onError ();
            callbacks.onComplete ();
            return;
        }

        FinalizeModel (this.model, {
            defaultLineMaterialColor : this.callbacks.getDefaultLineMaterialColor (),
            defaultMaterialColor : this.callbacks.getDefaultMaterialColor ()
        });

        callbacks.onSuccess ();
        callbacks.onComplete ();
    }

    GetModelEmptyErrorMessage ()
    {
        return Loc ('The model doesn\'t contain any meshes.');
    }

    CanImportExtension (extension)
    {
        return false;
    }

    GetUpDirection ()
    {
        return Direction.Z;
    }

    ClearContent ()
    {

    }

    ResetContent ()
    {

    }

    ImportContent (fileContent, onFinish)
    {

    }

    GetModel ()
    {
        return this.model;
    }

    SetError (message)
    {
        this.error = true;
        if (message !== undefined && message !== null) {
            if (typeof message === 'string') {
                this.message = message;
            } else if (message instanceof Error) {
                this.message = message.message;
            } else {
                this.message = message.toString ();
            }
        }
    }

    WasError ()
    {
        return this.error;
    }

    GetErrorMessage ()
    {
        return this.message;
    }
}
