import * as assert from 'assert';
import * as OV from '../../source/engine/main.js';

export default function suite ()
{

describe ('ModelComparator', function () {
    it ('Identical Cuboids Should Have No Differences', function () {
        const modelA = new OV.Model ();
        const modelB = new OV.Model ();

        const cuboidA = OV.GenerateCuboid (null, 1.0, 1.0, 1.0);
        const cuboidB = OV.GenerateCuboid (null, 1.0, 1.0, 1.0);

        const meshIndexA = modelA.AddMesh (cuboidA);
        const meshIndexB = modelB.AddMesh (cuboidB);

        const rootNodeA = modelA.GetRootNode ();
        const rootNodeB = modelB.GetRootNode ();
        rootNodeA.AddMeshIndex (meshIndexA);
        rootNodeB.AddMeshIndex (meshIndexB);

        OV.FinalizeModel (modelA);
        OV.FinalizeModel (modelB);

        const comparator = new OV.ModelComparator ();
        comparator.SetModels (modelA, modelB, null, null);
        const diffInfo = comparator.Compare ();

        assert.strictEqual (diffInfo.totalMeshes, 1);
        assert.strictEqual (diffInfo.addedMeshes, 0);
        assert.strictEqual (diffInfo.removedMeshes, 0);
        assert.strictEqual (diffInfo.modifiedMeshes, 0);
        assert.strictEqual (comparator.HasDifferences (), false);

        const meshDiffs = comparator.GetMeshDiffs ();
        assert.strictEqual (meshDiffs.length, 1);
        assert.strictEqual (meshDiffs[0].diffType, OV.DiffType.Identical);
        assert.strictEqual (meshDiffs[0].GetDiffTriangleCount (), 0);
    });

    it ('Different Sized Cuboids Should Be Detected As Modified With Triangle Details', function () {
        const modelA = new OV.Model ();
        const modelB = new OV.Model ();

        const cuboidA = OV.GenerateCuboid (null, 1.0, 1.0, 1.0);
        const cuboidB = OV.GenerateCuboid (null, 2.0, 1.0, 1.0);

        const meshIndexA = modelA.AddMesh (cuboidA);
        const meshIndexB = modelB.AddMesh (cuboidB);

        const rootNodeA = modelA.GetRootNode ();
        const rootNodeB = modelB.GetRootNode ();
        rootNodeA.AddMeshIndex (meshIndexA);
        rootNodeB.AddMeshIndex (meshIndexB);

        OV.FinalizeModel (modelA);
        OV.FinalizeModel (modelB);

        const comparator = new OV.ModelComparator ();
        comparator.SetModels (modelA, modelB, null, null);
        const diffInfo = comparator.Compare ();

        assert.strictEqual (diffInfo.totalMeshes, 1);
        assert.strictEqual (comparator.HasDifferences (), true);

        const meshDiffs = comparator.GetMeshDiffs ();
        assert.strictEqual (meshDiffs.length, 1);
        assert.strictEqual (meshDiffs[0].diffType, OV.DiffType.Modified);
        assert.ok (meshDiffs[0].GetDiffTriangleCount () > 0);
    });

    it ('Model With Extra Mesh Should Be Detected As Added', function () {
        const modelA = new OV.Model ();
        const modelB = new OV.Model ();

        const cuboidA = OV.GenerateCuboid (null, 1.0, 1.0, 1.0);
        const meshIndexA = modelA.AddMesh (cuboidA);
        const rootNodeA = modelA.GetRootNode ();
        rootNodeA.AddMeshIndex (meshIndexA);

        const cuboidB1 = OV.GenerateCuboid (null, 1.0, 1.0, 1.0);
        const cuboidB2 = OV.GenerateCuboid (null, 2.0, 2.0, 2.0);
        const meshIndexB1 = modelB.AddMesh (cuboidB1);
        const meshIndexB2 = modelB.AddMesh (cuboidB2);
        const rootNodeB = modelB.GetRootNode ();
        rootNodeB.AddMeshIndex (meshIndexB1);
        rootNodeB.AddMeshIndex (meshIndexB2);

        OV.FinalizeModel (modelA);
        OV.FinalizeModel (modelB);

        const comparator = new OV.ModelComparator ();
        comparator.SetModels (modelA, modelB, null, null);
        const diffInfo = comparator.Compare ();

        assert.strictEqual (diffInfo.totalMeshes, 1);
        assert.strictEqual (comparator.HasDifferences (), true);
        assert.strictEqual (diffInfo.addedMeshes, 1);

        const meshDiffs = comparator.GetMeshDiffs ();
        assert.strictEqual (meshDiffs.length, 2);

        let addedMeshCount = 0;
        let identicalMeshCount = 0;
        for (const meshDiff of meshDiffs) {
            if (meshDiff.diffType === OV.DiffType.Added) {
                addedMeshCount++;
                assert.ok (meshDiff.addedTriangles.length > 0);
            } else if (meshDiff.diffType === OV.DiffType.Identical) {
                identicalMeshCount++;
            }
        }
        assert.strictEqual (addedMeshCount, 1);
    });

    it ('Model With Missing Mesh Should Be Detected As Removed', function () {
        const modelA = new OV.Model ();
        const modelB = new OV.Model ();

        const cuboidA1 = OV.GenerateCuboid (null, 1.0, 1.0, 1.0);
        const cuboidA2 = OV.GenerateCuboid (null, 2.0, 2.0, 2.0);
        const meshIndexA1 = modelA.AddMesh (cuboidA1);
        const meshIndexA2 = modelA.AddMesh (cuboidA2);
        const rootNodeA = modelA.GetRootNode ();
        rootNodeA.AddMeshIndex (meshIndexA1);
        rootNodeA.AddMeshIndex (meshIndexA2);

        const cuboidB = OV.GenerateCuboid (null, 1.0, 1.0, 1.0);
        const meshIndexB = modelB.AddMesh (cuboidB);
        const rootNodeB = modelB.GetRootNode ();
        rootNodeB.AddMeshIndex (meshIndexB);

        OV.FinalizeModel (modelA);
        OV.FinalizeModel (modelB);

        const comparator = new OV.ModelComparator ();
        comparator.SetModels (modelA, modelB, null, null);
        const diffInfo = comparator.Compare ();

        assert.strictEqual (diffInfo.totalMeshes, 2);
        assert.strictEqual (comparator.HasDifferences (), true);
        assert.strictEqual (diffInfo.removedMeshes, 1);

        const meshDiffs = comparator.GetMeshDiffs ();

        let removedMeshCount = 0;
        for (const meshDiff of meshDiffs) {
            if (meshDiff.diffType === OV.DiffType.Removed) {
                removedMeshCount++;
                assert.ok (meshDiff.removedTriangles.length > 0);
            }
        }
        assert.strictEqual (removedMeshCount, 1);
    });

    it ('DiffType Constants Should Be Correct', function () {
        assert.strictEqual (OV.DiffType.Identical, 0);
        assert.strictEqual (OV.DiffType.Added, 1);
        assert.strictEqual (OV.DiffType.Removed, 2);
        assert.strictEqual (OV.DiffType.Modified, 3);
    });

    it ('DiffColor Constants Should Be RGBColor Objects', function () {
        assert.ok (OV.DiffColor.Identical instanceof OV.RGBColor);
        assert.ok (OV.DiffColor.Added instanceof OV.RGBColor);
        assert.ok (OV.DiffColor.Removed instanceof OV.RGBColor);
        assert.ok (OV.DiffColor.Modified instanceof OV.RGBColor);

        assert.strictEqual (OV.DiffColor.Identical.r, 200);
        assert.strictEqual (OV.DiffColor.Identical.g, 200);
        assert.strictEqual (OV.DiffColor.Identical.b, 200);

        assert.strictEqual (OV.DiffColor.Added.r, 0);
        assert.strictEqual (OV.DiffColor.Added.g, 255);
        assert.strictEqual (OV.DiffColor.Added.b, 0);

        assert.strictEqual (OV.DiffColor.Removed.r, 255);
        assert.strictEqual (OV.DiffColor.Removed.g, 0);
        assert.strictEqual (OV.DiffColor.Removed.b, 0);

        assert.strictEqual (OV.DiffColor.Modified.r, 0);
        assert.strictEqual (OV.DiffColor.Modified.g, 150);
        assert.strictEqual (OV.DiffColor.Modified.b, 255);
    });

    it ('ModelDiffInfo Should Have Correct Initial Values', function () {
        const diffInfo = new OV.ModelDiffInfo ();

        assert.strictEqual (diffInfo.totalMeshes, 0);
        assert.strictEqual (diffInfo.totalTriangles, 0);
        assert.strictEqual (diffInfo.totalVertices, 0);
        assert.strictEqual (diffInfo.addedMeshes, 0);
        assert.strictEqual (diffInfo.removedMeshes, 0);
        assert.strictEqual (diffInfo.modifiedMeshes, 0);
        assert.strictEqual (diffInfo.HasDifferences (), false);
        assert.strictEqual (diffInfo.meshDiffs.length, 0);
    });

    it ('MeshDiffInfo Should Have Correct Initial Values', function () {
        const meshDiff = new OV.MeshDiffInfo ();

        assert.strictEqual (meshDiff.meshName, '');
        assert.strictEqual (meshDiff.diffType, OV.DiffType.Identical);
        assert.strictEqual (meshDiff.totalTriangles, 0);
        assert.strictEqual (meshDiff.addedTriangles.length, 0);
        assert.strictEqual (meshDiff.removedTriangles.length, 0);
        assert.strictEqual (meshDiff.modifiedTrianglesA.length, 0);
        assert.strictEqual (meshDiff.modifiedTrianglesB.length, 0);
        assert.strictEqual (meshDiff.HasDifferences (), false);
        assert.strictEqual (meshDiff.GetDiffTriangleCount (), 0);
    });

    it ('ModelDiffInfo Add Method Should Combine Values', function () {
        const diffInfo1 = new OV.ModelDiffInfo ();
        diffInfo1.totalMeshes = 1;
        diffInfo1.totalTriangles = 12;
        diffInfo1.addedMeshes = 1;

        const meshDiff1 = new OV.MeshDiffInfo ();
        meshDiff1.diffType = OV.DiffType.Added;
        diffInfo1.meshDiffs.push (meshDiff1);

        const diffInfo2 = new OV.ModelDiffInfo ();
        diffInfo2.totalMeshes = 2;
        diffInfo2.totalTriangles = 24;
        diffInfo2.removedMeshes = 1;

        const meshDiff2 = new OV.MeshDiffInfo ();
        meshDiff2.diffType = OV.DiffType.Removed;
        diffInfo2.meshDiffs.push (meshDiff2);

        diffInfo1.Add (diffInfo2);

        assert.strictEqual (diffInfo1.totalMeshes, 3);
        assert.strictEqual (diffInfo1.totalTriangles, 36);
        assert.strictEqual (diffInfo1.addedMeshes, 1);
        assert.strictEqual (diffInfo1.removedMeshes, 1);
        assert.strictEqual (diffInfo1.HasDifferences (), true);
        assert.strictEqual (diffInfo1.meshDiffs.length, 2);
    });

    it ('ComparisonMode Constants Should Be Correct', function () {
        assert.strictEqual (OV.ComparisonMode.Overlay, 'overlay');
        assert.strictEqual (OV.ComparisonMode.SideBySide, 'sideBySide');
        assert.strictEqual (OV.ComparisonMode.DiffOnly, 'diffOnly');
    });

    it ('Empty Models Should Have No Differences', function () {
        const modelA = new OV.Model ();
        const modelB = new OV.Model ();

        OV.FinalizeModel (modelA);
        OV.FinalizeModel (modelB);

        const comparator = new OV.ModelComparator ();
        comparator.SetModels (modelA, modelB, null, null);
        const diffInfo = comparator.Compare ();

        assert.strictEqual (diffInfo.totalMeshes, 0);
        assert.strictEqual (diffInfo.addedMeshes, 0);
        assert.strictEqual (diffInfo.removedMeshes, 0);
        assert.strictEqual (comparator.HasDifferences (), false);
        assert.strictEqual (comparator.GetMeshDiffs ().length, 0);
    });

    it ('Custom Triangle Mesh Should Detect Differences By Triangle Position', function () {
        const modelA = new OV.Model ();
        const modelB = new OV.Model ();

        const meshA = new OV.Mesh ();
        meshA.AddVertex (new OV.Coord3D (0, 0, 0));
        meshA.AddVertex (new OV.Coord3D (1, 0, 0));
        meshA.AddVertex (new OV.Coord3D (0, 1, 0));
        const triA = new OV.Triangle (0, 1, 2);
        meshA.AddTriangle (triA);

        const meshB = new OV.Mesh ();
        meshB.AddVertex (new OV.Coord3D (0, 0, 0));
        meshB.AddVertex (new OV.Coord3D (2, 0, 0));
        meshB.AddVertex (new OV.Coord3D (0, 2, 0));
        const triB = new OV.Triangle (0, 1, 2);
        meshB.AddTriangle (triB);

        const meshIndexA = modelA.AddMesh (meshA);
        const meshIndexB = modelB.AddMesh (meshB);

        const rootNodeA = modelA.GetRootNode ();
        const rootNodeB = modelB.GetRootNode ();
        rootNodeA.AddMeshIndex (meshIndexA);
        rootNodeB.AddMeshIndex (meshIndexB);

        OV.FinalizeModel (modelA);
        OV.FinalizeModel (modelB);

        const comparator = new OV.ModelComparator ();
        comparator.SetModels (modelA, modelB, null, null);
        const diffInfo = comparator.Compare ();

        assert.strictEqual (diffInfo.totalMeshes, 1);
        assert.strictEqual (comparator.HasDifferences (), true);

        const meshDiffs = comparator.GetMeshDiffs ();
        assert.strictEqual (meshDiffs.length, 1);
        assert.strictEqual (meshDiffs[0].diffType, OV.DiffType.Modified);
        assert.ok (meshDiffs[0].modifiedTrianglesA.length > 0);
        assert.ok (meshDiffs[0].modifiedTrianglesB.length > 0);
    });

    it ('Custom Triangle Mesh With Identical Triangles Should Have No Differences', function () {
        const modelA = new OV.Model ();
        const modelB = new OV.Model ();

        const meshA = new OV.Mesh ();
        meshA.AddVertex (new OV.Coord3D (0, 0, 0));
        meshA.AddVertex (new OV.Coord3D (1, 0, 0));
        meshA.AddVertex (new OV.Coord3D (0, 1, 0));
        const triA = new OV.Triangle (0, 1, 2);
        meshA.AddTriangle (triA);

        const meshB = new OV.Mesh ();
        meshB.AddVertex (new OV.Coord3D (0, 0, 0));
        meshB.AddVertex (new OV.Coord3D (1, 0, 0));
        meshB.AddVertex (new OV.Coord3D (0, 1, 0));
        const triB = new OV.Triangle (0, 1, 2);
        meshB.AddTriangle (triB);

        const meshIndexA = modelA.AddMesh (meshA);
        const meshIndexB = modelB.AddMesh (meshB);

        const rootNodeA = modelA.GetRootNode ();
        const rootNodeB = modelB.GetRootNode ();
        rootNodeA.AddMeshIndex (meshIndexA);
        rootNodeB.AddMeshIndex (meshIndexB);

        OV.FinalizeModel (modelA);
        OV.FinalizeModel (modelB);

        const comparator = new OV.ModelComparator ();
        comparator.SetModels (modelA, modelB, null, null);
        const diffInfo = comparator.Compare ();

        assert.strictEqual (diffInfo.totalMeshes, 1);
        assert.strictEqual (comparator.HasDifferences (), false);

        const meshDiffs = comparator.GetMeshDiffs ();
        assert.strictEqual (meshDiffs.length, 1);
        assert.strictEqual (meshDiffs[0].diffType, OV.DiffType.Identical);
        assert.strictEqual (meshDiffs[0].GetDiffTriangleCount (), 0);
    });

    it ('GetDiffInfo Should Return Null Before Comparison', function () {
        const comparator = new OV.ModelComparator ();
        const diffInfo = comparator.GetDiffInfo ();
        assert.strictEqual (diffInfo, null);
    });

    it ('HasDifferences Should Return False Before Comparison', function () {
        const comparator = new OV.ModelComparator ();
        assert.strictEqual (comparator.HasDifferences (), false);
    });

    it ('GetMeshDiffs Should Return Empty Array Before Comparison', function () {
        const comparator = new OV.ModelComparator ();
        const meshDiffs = comparator.GetMeshDiffs ();
        assert.strictEqual (meshDiffs.length, 0);
    });

    it ('OverlayOpacity Should Be Configurable', function () {
        const comparator = new OV.ModelComparator ();

        assert.strictEqual (comparator.GetOverlayOpacity (), 0.5);

        comparator.SetOverlayOpacity (0.7);
        assert.strictEqual (comparator.GetOverlayOpacity (), 0.7);

        comparator.SetOverlayOpacity (0.0);
        assert.strictEqual (comparator.GetOverlayOpacity (), 0.0);

        comparator.SetOverlayOpacity (1.0);
        assert.strictEqual (comparator.GetOverlayOpacity (), 1.0);

        comparator.SetOverlayOpacity (-0.5);
        assert.strictEqual (comparator.GetOverlayOpacity (), 0.0);

        comparator.SetOverlayOpacity (1.5);
        assert.strictEqual (comparator.GetOverlayOpacity (), 1.0);
    });

    it ('Multiple Meshes With Mixed Differences Should Be Correctly Detected', function () {
        const modelA = new OV.Model ();
        const modelB = new OV.Model ();

        const meshA1 = OV.GenerateCuboid (null, 1.0, 1.0, 1.0);
        meshA1.SetName ('Mesh_Identical');
        const meshIndexA1 = modelA.AddMesh (meshA1);

        const meshA2 = OV.GenerateCuboid (null, 2.0, 2.0, 2.0);
        meshA2.SetName ('Mesh_Removed');
        const meshIndexA2 = modelA.AddMesh (meshA2);

        const meshA3 = OV.GenerateCuboid (null, 1.0, 1.0, 1.0);
        meshA3.SetName ('Mesh_Modified');
        const meshIndexA3 = modelA.AddMesh (meshA3);

        const rootNodeA = modelA.GetRootNode ();
        rootNodeA.AddMeshIndex (meshIndexA1);
        rootNodeA.AddMeshIndex (meshIndexA2);
        rootNodeA.AddMeshIndex (meshIndexA3);

        const meshB1 = OV.GenerateCuboid (null, 1.0, 1.0, 1.0);
        meshB1.SetName ('Mesh_Identical');
        const meshIndexB1 = modelB.AddMesh (meshB1);

        const meshB3 = OV.GenerateCuboid (null, 3.0, 3.0, 3.0);
        meshB3.SetName ('Mesh_Modified');
        const meshIndexB3 = modelB.AddMesh (meshB3);

        const meshB4 = OV.GenerateCuboid (null, 4.0, 4.0, 4.0);
        meshB4.SetName ('Mesh_Added');
        const meshIndexB4 = modelB.AddMesh (meshB4);

        const rootNodeB = modelB.GetRootNode ();
        rootNodeB.AddMeshIndex (meshIndexB1);
        rootNodeB.AddMeshIndex (meshIndexB3);
        rootNodeB.AddMeshIndex (meshIndexB4);

        OV.FinalizeModel (modelA);
        OV.FinalizeModel (modelB);

        const comparator = new OV.ModelComparator ();
        comparator.SetModels (modelA, modelB, null, null);
        const diffInfo = comparator.Compare ();

        assert.strictEqual (diffInfo.totalMeshes, 3);
        assert.strictEqual (diffInfo.addedMeshes, 1);
        assert.strictEqual (diffInfo.removedMeshes, 1);
        assert.strictEqual (diffInfo.modifiedMeshes, 1);
        assert.strictEqual (comparator.HasDifferences (), true);
    });
});

}
