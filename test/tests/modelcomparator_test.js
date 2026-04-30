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
    });

    it ('Different Sized Cuboids Should Be Detected As Modified', function () {
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
        assert.strictEqual (OV.DiffColor.Added.g, 200);
        assert.strictEqual (OV.DiffColor.Added.b, 0);

        assert.strictEqual (OV.DiffColor.Removed.r, 200);
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
    });

    it ('ModelDiffInfo Add Method Should Combine Values', function () {
        const diffInfo1 = new OV.ModelDiffInfo ();
        diffInfo1.totalMeshes = 1;
        diffInfo1.totalTriangles = 12;
        diffInfo1.addedMeshes = 1;

        const diffInfo2 = new OV.ModelDiffInfo ();
        diffInfo2.totalMeshes = 2;
        diffInfo2.totalTriangles = 24;
        diffInfo2.removedMeshes = 1;

        diffInfo1.Add (diffInfo2);

        assert.strictEqual (diffInfo1.totalMeshes, 3);
        assert.strictEqual (diffInfo1.totalTriangles, 36);
        assert.strictEqual (diffInfo1.addedMeshes, 1);
        assert.strictEqual (diffInfo1.removedMeshes, 1);
        assert.strictEqual (diffInfo1.HasDifferences (), true);
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
    });

    it ('Different Triangle Meshes Should Be Detected', function () {
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
});

}
