import * as assert from 'assert';
import * as THREE from 'three';
import { Annotation, AnnotationTool } from '../../source/website/annotationtool.js';
import { IntersectionMode } from '../../source/engine/viewer/viewermodel.js';

function CreateMockViewer ()
{
    let extraObjects = [];
    let intersectionPoint = new THREE.Vector3 (1.0, 2.0, 3.0);
    let isRendered = false;

    return {
        GetMeshIntersectionUnderMouse : function (mode, mouseCoordinates) {
            if (intersectionPoint === null) {
                return null;
            }
            return {
                point : intersectionPoint,
                object : {
                    updateWorldMatrix : function () {},
                    matrixWorld : new THREE.Matrix4 ()
                },
                face : {
                    normal : new THREE.Vector3 (0.0, 1.0, 0.0)
                }
            };
        },
        GetBoundingSphere : function (filter) {
            return {
                center : new THREE.Vector3 (0.0, 0.0, 0.0),
                radius : 40.0
            };
        },
        AddExtraObject : function (object) {
            extraObjects.push (object);
        },
        ClearExtra : function () {
            extraObjects = [];
        },
        Render : function () {
            isRendered = true;
        },
        FitSphereToWindow : function (sphere, animate) {
        },
        SetIntersectionPoint : function (point) {
            intersectionPoint = point;
        },
        ClearIntersectionPoint : function () {
            intersectionPoint = null;
        },
        GetExtraObjects : function () {
            return extraObjects;
        },
        IsRendered : function () {
            return isRendered;
        },
        ResetRendered : function () {
            isRendered = false;
        }
    };
}

function CreateMockSettings ()
{
    return {
        GetTheme : function () {
            return 'dark';
        }
    };
}

function CreateMockButton ()
{
    return {
        selected : false,
        SetSelected : function (isSelected) {
            this.selected = isSelected;
        },
        IsSelected : function () {
            return this.selected;
        }
    };
}

function CreateIntersection (x, y, z)
{
    return {
        point : new THREE.Vector3 (x, y, z),
        object : {
            updateWorldMatrix : function () {},
            matrixWorld : new THREE.Matrix4 ()
        },
        face : {
            normal : new THREE.Vector3 (0.0, 1.0, 0.0)
        }
    };
}

export default function suite ()
{

describe ('Annotation', function () {
    it ('Default Initialization', function () {
        let intersection = CreateIntersection (1.0, 2.0, 3.0);
        let annotation = new Annotation (1, intersection, 1.0, 'Test note');

        assert.strictEqual (annotation.id, 1);
        assert.strictEqual (annotation.GetNote (), 'Test note');
        assert.strictEqual (annotation.GetLabel (), 'Annotation 1');
        assert.ok (annotation.GetIntersection () !== null);
        assert.ok (annotation.GetObject () !== null);
    });

    it ('Update Note', function () {
        let intersection = CreateIntersection (1.0, 2.0, 3.0);
        let annotation = new Annotation (1, intersection, 1.0);

        assert.strictEqual (annotation.GetNote (), '');
        annotation.SetNote ('New note');
        assert.strictEqual (annotation.GetNote (), 'New note');
    });

    it ('Update Label', function () {
        let intersection = CreateIntersection (1.0, 2.0, 3.0);
        let annotation = new Annotation (1, intersection, 1.0);

        assert.strictEqual (annotation.GetLabel (), 'Annotation 1');
        annotation.SetLabel ('Custom Label');
        assert.strictEqual (annotation.GetLabel (), 'Custom Label');
    });

    it ('Show and Hide', function () {
        let intersection = CreateIntersection (1.0, 2.0, 3.0);
        let annotation = new Annotation (1, intersection, 1.0);

        assert.strictEqual (annotation.GetObject ().visible, true);
        annotation.Show (false);
        assert.strictEqual (annotation.GetObject ().visible, false);
        annotation.Show (true);
        assert.strictEqual (annotation.GetObject ().visible, true);
    });

    it ('Update Position', function () {
        let intersection1 = CreateIntersection (1.0, 2.0, 3.0);
        let annotation = new Annotation (1, intersection1, 1.0);

        let position1 = annotation.GetIntersection ().point;
        assert.strictEqual (position1.x, 1.0);
        assert.strictEqual (position1.y, 2.0);
        assert.strictEqual (position1.z, 3.0);

        let intersection2 = CreateIntersection (4.0, 5.0, 6.0);
        annotation.UpdatePosition (intersection2);

        let position2 = annotation.GetIntersection ().point;
        assert.strictEqual (position2.x, 4.0);
        assert.strictEqual (position2.y, 5.0);
        assert.strictEqual (position2.z, 6.0);
    });
});

describe ('AnnotationTool', function () {
    it ('Default Initialization', function () {
        let viewer = CreateMockViewer ();
        let settings = CreateMockSettings ();
        let tool = new AnnotationTool (viewer, settings);

        assert.strictEqual (tool.IsActive (), false);
        assert.strictEqual (tool.GetAnnotations ().length, 0);
    });

    it ('Init Callbacks', function () {
        let viewer = CreateMockViewer ();
        let settings = CreateMockSettings ();
        let tool = new AnnotationTool (viewer, settings);

        let callbacksCalled = {
            onUpdatePanel : false,
            onAnnotationAdded : false,
            onAnnotationRemoved : false,
            onAnnotationUpdated : false
        };

        tool.Init ({
            onUpdatePanel : (annotations) => {
                callbacksCalled.onUpdatePanel = true;
            },
            onAnnotationAdded : (annotation) => {
                callbacksCalled.onAnnotationAdded = true;
            },
            onAnnotationRemoved : (annotation) => {
                callbacksCalled.onAnnotationRemoved = true;
            },
            onAnnotationUpdated : (annotation) => {
                callbacksCalled.onAnnotationUpdated = true;
            }
        });

        assert.ok (tool.callbacks !== null);
    });

    it ('Set Active', function () {
        let viewer = CreateMockViewer ();
        let settings = CreateMockSettings ();
        let tool = new AnnotationTool (viewer, settings);
        let button = CreateMockButton ();
        tool.SetButton (button);

        assert.strictEqual (tool.IsActive (), false);
        assert.strictEqual (button.IsSelected (), false);

        tool.SetActive (true);
        assert.strictEqual (tool.IsActive (), true);
        assert.strictEqual (button.IsSelected (), true);

        tool.SetActive (true);
        assert.strictEqual (tool.IsActive (), true);
        assert.strictEqual (button.IsSelected (), true);

        tool.SetActive (false);
        assert.strictEqual (tool.IsActive (), false);
        assert.strictEqual (button.IsSelected (), false);
    });

    it ('Add Annotation', function () {
        let viewer = CreateMockViewer ();
        let settings = CreateMockSettings ();
        let tool = new AnnotationTool (viewer, settings);

        let addedAnnotations = [];
        tool.Init ({
            onAnnotationAdded : (annotation) => {
                addedAnnotations.push (annotation);
            }
        });

        assert.strictEqual (tool.GetAnnotations ().length, 0);
        assert.strictEqual (addedAnnotations.length, 0);

        let intersection1 = CreateIntersection (1.0, 2.0, 3.0);
        let annotation1 = tool.AddAnnotation (intersection1, 'Note 1');

        assert.strictEqual (tool.GetAnnotations ().length, 1);
        assert.strictEqual (addedAnnotations.length, 1);
        assert.strictEqual (annotation1.id, 1);
        assert.strictEqual (annotation1.GetNote (), 'Note 1');
        assert.strictEqual (viewer.GetExtraObjects ().length, 1);

        let intersection2 = CreateIntersection (4.0, 5.0, 6.0);
        let annotation2 = tool.AddAnnotation (intersection2, 'Note 2');

        assert.strictEqual (tool.GetAnnotations ().length, 2);
        assert.strictEqual (addedAnnotations.length, 2);
        assert.strictEqual (annotation2.id, 2);
        assert.strictEqual (annotation2.GetNote (), 'Note 2');
        assert.strictEqual (viewer.GetExtraObjects ().length, 2);
    });

    it ('Get Annotation By Id', function () {
        let viewer = CreateMockViewer ();
        let settings = CreateMockSettings ();
        let tool = new AnnotationTool (viewer, settings);

        let intersection1 = CreateIntersection (1.0, 2.0, 3.0);
        tool.AddAnnotation (intersection1, 'Note 1');

        let intersection2 = CreateIntersection (4.0, 5.0, 6.0);
        tool.AddAnnotation (intersection2, 'Note 2');

        let annotation1 = tool.GetAnnotationById (1);
        assert.ok (annotation1 !== undefined);
        assert.strictEqual (annotation1.id, 1);

        let annotation2 = tool.GetAnnotationById (2);
        assert.ok (annotation2 !== undefined);
        assert.strictEqual (annotation2.id, 2);

        let annotation3 = tool.GetAnnotationById (999);
        assert.strictEqual (annotation3, undefined);
    });

    it ('Update Annotation Note', function () {
        let viewer = CreateMockViewer ();
        let settings = CreateMockSettings ();
        let tool = new AnnotationTool (viewer, settings);

        let updatedAnnotations = [];
        tool.Init ({
            onAnnotationUpdated : (annotation) => {
                updatedAnnotations.push (annotation);
            }
        });

        let intersection = CreateIntersection (1.0, 2.0, 3.0);
        let annotation = tool.AddAnnotation (intersection, 'Original Note');

        assert.strictEqual (annotation.GetNote (), 'Original Note');
        assert.strictEqual (updatedAnnotations.length, 0);

        let result = tool.UpdateAnnotationNote (1, 'Updated Note');
        assert.strictEqual (result, true);
        assert.strictEqual (annotation.GetNote (), 'Updated Note');
        assert.strictEqual (updatedAnnotations.length, 1);

        let result2 = tool.UpdateAnnotationNote (999, 'Note');
        assert.strictEqual (result2, false);
    });

    it ('Update Annotation Label', function () {
        let viewer = CreateMockViewer ();
        let settings = CreateMockSettings ();
        let tool = new AnnotationTool (viewer, settings);

        let updatedAnnotations = [];
        tool.Init ({
            onAnnotationUpdated : (annotation) => {
                updatedAnnotations.push (annotation);
            }
        });

        let intersection = CreateIntersection (1.0, 2.0, 3.0);
        let annotation = tool.AddAnnotation (intersection);

        assert.strictEqual (annotation.GetLabel (), 'Annotation 1');
        assert.strictEqual (updatedAnnotations.length, 0);

        let result = tool.UpdateAnnotationLabel (1, 'My Custom Label');
        assert.strictEqual (result, true);
        assert.strictEqual (annotation.GetLabel (), 'My Custom Label');
        assert.strictEqual (updatedAnnotations.length, 1);

        let result2 = tool.UpdateAnnotationLabel (999, 'Label');
        assert.strictEqual (result2, false);
    });

    it ('Remove Annotation', function () {
        let viewer = CreateMockViewer ();
        let settings = CreateMockSettings ();
        let tool = new AnnotationTool (viewer, settings);

        let removedAnnotations = [];
        tool.Init ({
            onAnnotationRemoved : (annotation) => {
                removedAnnotations.push (annotation);
            }
        });

        let intersection1 = CreateIntersection (1.0, 2.0, 3.0);
        tool.AddAnnotation (intersection1, 'Note 1');

        let intersection2 = CreateIntersection (4.0, 5.0, 6.0);
        tool.AddAnnotation (intersection2, 'Note 2');

        assert.strictEqual (tool.GetAnnotations ().length, 2);
        assert.strictEqual (removedAnnotations.length, 0);

        let result = tool.RemoveAnnotation (1);
        assert.strictEqual (result, true);
        assert.strictEqual (tool.GetAnnotations ().length, 1);
        assert.strictEqual (removedAnnotations.length, 1);
        assert.strictEqual (removedAnnotations[0].id, 1);

        let result2 = tool.RemoveAnnotation (999);
        assert.strictEqual (result2, false);
        assert.strictEqual (tool.GetAnnotations ().length, 1);
        assert.strictEqual (removedAnnotations.length, 1);
    });

    it ('Clear All Annotations', function () {
        let viewer = CreateMockViewer ();
        let settings = CreateMockSettings ();
        let tool = new AnnotationTool (viewer, settings);

        let intersection1 = CreateIntersection (1.0, 2.0, 3.0);
        tool.AddAnnotation (intersection1, 'Note 1');

        let intersection2 = CreateIntersection (4.0, 5.0, 6.0);
        tool.AddAnnotation (intersection2, 'Note 2');

        assert.strictEqual (tool.GetAnnotations ().length, 2);

        tool.ClearAll ();

        assert.strictEqual (tool.GetAnnotations ().length, 0);
    });

    it ('Sidebar Sync via Callbacks', function () {
        let viewer = CreateMockViewer ();
        let settings = CreateMockSettings ();
        let tool = new AnnotationTool (viewer, settings);

        let panelUpdates = [];
        let addedAnnotations = [];
        let removedAnnotations = [];

        tool.Init ({
            onUpdatePanel : (annotations) => {
                panelUpdates.push (annotations.map (ann => ({
                    id : ann.id,
                    note : ann.GetNote (),
                    label : ann.GetLabel ()
                })));
            },
            onAnnotationAdded : (annotation) => {
                addedAnnotations.push ({
                    id : annotation.id,
                    note : annotation.GetNote ()
                });
            },
            onAnnotationRemoved : (annotation) => {
                removedAnnotations.push ({
                    id : annotation.id
                });
            }
        });

        assert.strictEqual (panelUpdates.length, 0);
        assert.strictEqual (addedAnnotations.length, 0);
        assert.strictEqual (removedAnnotations.length, 0);

        let intersection1 = CreateIntersection (1.0, 2.0, 3.0);
        tool.AddAnnotation (intersection1, 'First Note');

        assert.strictEqual (panelUpdates.length, 1);
        assert.strictEqual (panelUpdates[0].length, 1);
        assert.strictEqual (panelUpdates[0][0].id, 1);
        assert.strictEqual (panelUpdates[0][0].note, 'First Note');
        assert.strictEqual (addedAnnotations.length, 1);
        assert.strictEqual (addedAnnotations[0].id, 1);

        let intersection2 = CreateIntersection (4.0, 5.0, 6.0);
        tool.AddAnnotation (intersection2, 'Second Note');

        assert.strictEqual (panelUpdates.length, 2);
        assert.strictEqual (panelUpdates[1].length, 2);
        assert.strictEqual (panelUpdates[1][0].id, 1);
        assert.strictEqual (panelUpdates[1][1].id, 2);
        assert.strictEqual (addedAnnotations.length, 2);

        tool.UpdateAnnotationNote (1, 'Updated First Note');

        assert.strictEqual (panelUpdates.length, 3);
        assert.strictEqual (panelUpdates[2][0].note, 'Updated First Note');

        tool.RemoveAnnotation (1);

        assert.strictEqual (panelUpdates.length, 4);
        assert.strictEqual (panelUpdates[3].length, 1);
        assert.strictEqual (panelUpdates[3][0].id, 2);
        assert.strictEqual (removedAnnotations.length, 1);
        assert.strictEqual (removedAnnotations[0].id, 1);

        tool.ClearAll ();

        assert.strictEqual (panelUpdates.length, 5);
        assert.strictEqual (panelUpdates[4].length, 0);
    });

    it ('Fit Annotation To Window', function () {
        let viewer = CreateMockViewer ();
        let settings = CreateMockSettings ();
        let tool = new AnnotationTool (viewer, settings);

        let fitCalled = false;
        viewer.FitSphereToWindow = function (sphere, animate) {
            fitCalled = true;
        };

        let intersection = CreateIntersection (1.0, 2.0, 3.0);
        tool.AddAnnotation (intersection, 'Test');

        assert.strictEqual (fitCalled, false);

        tool.FitAnnotationToWindow (1);
        assert.strictEqual (fitCalled, true);

        fitCalled = false;
        tool.FitAnnotationToWindow (999);
        assert.strictEqual (fitCalled, false);
    });
});

}
