import { Direction } from '../geometry/geometry.js';
import { Importer } from '../import/importer.js';
import { RevokeObjectUrl } from '../io/bufferutils.js';
import { MaterialSource } from '../model/material.js';
import { ProgressStage, ProgressManager } from '../core/progress.js';
import { ConvertModelToThreeObject, ModelToThreeConversionOutput, ModelToThreeConversionParams } from './threeconverter.js';
import { ConvertColorToThreeColor, HasHighpDriverIssue } from './threeutils.js';

import * as THREE from 'three';

export class ThreeModelLoader
{
    constructor ()
    {
        this.importer = new Importer ();
        this.inProgress = false;
        this.defaultMaterials = null;
        this.objectUrls = null;
        this.hasHighpDriverIssue = HasHighpDriverIssue ();
        this.progressManager = new ProgressManager ();
    }

    InProgress ()
    {
        return this.inProgress;
    }

    GetProgressManager ()
    {
        return this.progressManager;
    }

    LoadModel (inputFiles, settings, callbacks)
    {
        if (this.inProgress) {
            return;
        }

        this.inProgress = true;
        this.progressManager.Reset ();
        this.RevokeObjectUrls ();

        this.progressManager.SetStage (ProgressStage.LoadingFiles);

        this.importer.ImportFiles (inputFiles, settings, {
            onLoadStart : () => {
                callbacks.onLoadStart ();
            },
            onFileListProgress : (current, total) => {
                this.progressManager.SetStageProgress (current, total);
                callbacks.onFileListProgress (current, total);
            },
            onFileLoadProgress : (current, total, fileName) => {
                if (fileName !== undefined && fileName !== null) {
                    this.progressManager.SetCurrentFileName (fileName);
                }
                this.progressManager.SetBytesProgress (current, total);
                callbacks.onFileLoadProgress (current, total, fileName);
            },
            onDecompressStart : () => {
                this.progressManager.SetStage (ProgressStage.Decompressing);
                if (callbacks.onDecompressStart) {
                    callbacks.onDecompressStart ();
                }
            },
            onDecompressEnd : () => {
                if (callbacks.onDecompressEnd) {
                    callbacks.onDecompressEnd ();
                }
            },
            onImportStart : () => {
                this.progressManager.SetStage (ProgressStage.Parsing);
                callbacks.onImportStart ();
            },
            onSelectMainFile : (fileNames, selectFile) => {
                if (!callbacks.onSelectMainFile) {
                    selectFile (0);
                } else {
                    callbacks.onSelectMainFile (fileNames, selectFile);
                }
            },
            onImportSuccess : (importResult) => {
                this.progressManager.SetStage (ProgressStage.Converting);
                callbacks.onVisualizationStart ();
                let params = new ModelToThreeConversionParams ();
                params.forceMediumpForMaterials = this.hasHighpDriverIssue;
                let output = new ModelToThreeConversionOutput ();
                ConvertModelToThreeObject (importResult.model, params, output, {
                    onProgress : (progress, total) => {
                        this.progressManager.SetStageProgress (progress, total);
                        if (callbacks.onConversionProgress) {
                            callbacks.onConversionProgress (progress, total);
                        }
                    },
                    onTextureNeeded : (count) => {
                        this.progressManager.SetStage (ProgressStage.LoadingTextures);
                        this.progressManager.SetStageProgress (0, count);
                    },
                    onTextureLoaded : () => {
                        let progressInfo = this.progressManager.GetProgressInfo ();
                        this.progressManager.SetStageProgress (progressInfo.stageProgress + 1, progressInfo.stageTotal);
                        callbacks.onTextureLoaded ();
                    },
                    onModelLoaded : (threeObject) => {
                        this.progressManager.SetStage (ProgressStage.Complete);
                        this.progressManager.SetStageProgress (1, 1);
                        this.defaultMaterials = output.defaultMaterials;
                        this.objectUrls = output.objectUrls;
                        if (importResult.upVector === Direction.X) {
                            let rotation = new THREE.Quaternion ().setFromAxisAngle (new THREE.Vector3 (0.0, 0.0, 1.0), Math.PI / 2.0);
                            threeObject.quaternion.multiply (rotation);
                        } else if (importResult.upVector === Direction.Z) {
                            let rotation = new THREE.Quaternion ().setFromAxisAngle (new THREE.Vector3 (1.0, 0.0, 0.0), -Math.PI / 2.0);
                            threeObject.quaternion.multiply (rotation);
                        }
                        callbacks.onModelFinished (importResult, threeObject);
                        this.inProgress = false;
                    }
                });
            },
            onImportError : (importError) => {
                callbacks.onLoadError (importError);
                this.inProgress = false;
            }
        });
    }

    GetImporter ()
    {
        return this.importer;
    }

    GetDefaultMaterials ()
    {
        return this.defaultMaterials;
    }

    ReplaceDefaultMaterialsColor (defaultColor, defaultLineColor)
    {
        if (this.defaultMaterials !== null) {
            for (let defaultMaterial of this.defaultMaterials) {
                if (!defaultMaterial.vertexColors) {
                    if (defaultMaterial.userData.source === MaterialSource.DefaultFace) {
                        defaultMaterial.color = ConvertColorToThreeColor (defaultColor);
                    } else if (defaultMaterial.userData.source === MaterialSource.DefaultLine) {
                        defaultMaterial.color = ConvertColorToThreeColor (defaultLineColor);
                    }
                }
            }
        }
    }

    RevokeObjectUrls ()
    {
        if (this.objectUrls === null) {
            return;
        }
        for (let objectUrl of this.objectUrls) {
            RevokeObjectUrl (objectUrl);
        }
        this.objectUrls = null;
    }

    Destroy ()
    {
        this.RevokeObjectUrls ();
        this.importer = null;
    }
}
