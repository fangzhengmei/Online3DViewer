import * as assert from 'assert';
import * as OV from '../../source/engine/main.js';

export default function suite ()
{

describe ('Progress', function () {
    it ('ProgressStage is defined', function () {
        assert.strictEqual (OV.ProgressStage.LoadingFiles, 'loading_files');
        assert.strictEqual (OV.ProgressStage.Decompressing, 'decompressing');
        assert.strictEqual (OV.ProgressStage.Parsing, 'parsing');
        assert.strictEqual (OV.ProgressStage.Converting, 'converting');
        assert.strictEqual (OV.ProgressStage.LoadingTextures, 'loading_textures');
        assert.strictEqual (OV.ProgressStage.Complete, 'complete');
    });

    it ('ProgressInfo default values', function () {
        let manager = new OV.ProgressManager ();
        let info = manager.GetProgressInfo ();
        assert.strictEqual (info.stage, OV.ProgressStage.LoadingFiles);
        assert.strictEqual (info.stageProgress, 0);
        assert.strictEqual (info.stageTotal, 0);
        assert.strictEqual (info.stagePercentage, 0);
        assert.strictEqual (info.overallPercentage, 0);
        assert.strictEqual (info.currentFileName, null);
        assert.strictEqual (info.bytesLoaded, 0);
        assert.strictEqual (info.bytesTotal, 0);
    });

    it ('ProgressInfo stage progress', function () {
        let manager = new OV.ProgressManager ();
        manager.SetStageProgress (5, 10);
        let info = manager.GetProgressInfo ();
        assert.strictEqual (info.stageProgress, 5);
        assert.strictEqual (info.stageTotal, 10);
        assert.strictEqual (info.stagePercentage, 50);
    });

    it ('ProgressInfo bytes progress', function () {
        let manager = new OV.ProgressManager ();
        manager.SetBytesProgress (512, 1024);
        let info = manager.GetProgressInfo ();
        assert.strictEqual (info.bytesLoaded, 512);
        assert.strictEqual (info.bytesTotal, 1024);
        assert.strictEqual (info.stagePercentage, 50);
    });

    it ('ProgressInfo file name', function () {
        let manager = new OV.ProgressManager ();
        manager.SetCurrentFileName ('test.obj');
        let info = manager.GetProgressInfo ();
        assert.strictEqual (info.currentFileName, 'test.obj');
    });

    it ('ProgressInfo stage change', function () {
        let manager = new OV.ProgressManager ();
        manager.SetStageProgress (5, 10);
        manager.SetCurrentFileName ('test.obj');
        manager.SetStage (OV.ProgressStage.Parsing);
        let info = manager.GetProgressInfo ();
        assert.strictEqual (info.stage, OV.ProgressStage.Parsing);
        assert.strictEqual (info.stageProgress, 0);
        assert.strictEqual (info.currentFileName, null);
    });

    it ('ProgressInfo listeners', function () {
        let manager = new OV.ProgressManager ();
        let calledCount = 0;
        let lastInfo = null;
        manager.AddListener ((info) => {
            calledCount++;
            lastInfo = info;
        });
        manager.SetStageProgress (5, 10);
        assert.strictEqual (calledCount, 1);
        assert.strictEqual (lastInfo.stageProgress, 5);
        assert.strictEqual (lastInfo.stageTotal, 10);
    });

    it ('ProgressInfo remove listeners', function () {
        let manager = new OV.ProgressManager ();
        let calledCount = 0;
        let listener = (info) => {
            calledCount++;
        };
        manager.AddListener (listener);
        manager.SetStageProgress (5, 10);
        manager.RemoveListener (listener);
        manager.SetStageProgress (8, 10);
        assert.strictEqual (calledCount, 1);
    });

    it ('FormatFileSize', function () {
        assert.strictEqual (OV.FormatFileSize (0), '0 B');
        assert.strictEqual (OV.FormatFileSize (1024), '1 KB');
        assert.strictEqual (OV.FormatFileSize (1024 * 1024), '1 MB');
        assert.strictEqual (OV.FormatFileSize (1024 * 1024 * 1024), '1 GB');
    });

    it ('FormatPercentage', function () {
        assert.strictEqual (OV.FormatPercentage (0), '0.0%');
        assert.strictEqual (OV.FormatPercentage (50), '50.0%');
        assert.strictEqual (OV.FormatPercentage (100), '100.0%');
        assert.strictEqual (OV.FormatPercentage (33.333), '33.3%');
    });

    it ('ProgressInfo clone is independent', function () {
        let manager = new OV.ProgressManager ();
        manager.SetCurrentFileName ('test.obj');
        let info1 = manager.GetProgressInfo ();
        manager.SetCurrentFileName ('other.obj');
        let info2 = manager.GetProgressInfo ();
        assert.strictEqual (info1.currentFileName, 'test.obj');
        assert.strictEqual (info2.currentFileName, 'other.obj');
    });

    it ('Skipped stages are marked as completed when setting Complete', function () {
        let manager = new OV.ProgressManager ();
        
        manager.SetStageProgress (10, 10);
        manager.SetStage (OV.ProgressStage.Parsing);
        manager.SetStageProgress (10, 10);
        manager.SetStage (OV.ProgressStage.Converting);
        manager.SetStageProgress (10, 10);
        
        let info1 = manager.GetProgressInfo ();
        let visitedStages1 = manager.GetVisitedStages ();
        let completedStages1 = manager.GetCompletedStages ();
        
        assert.strictEqual (visitedStages1.has (OV.ProgressStage.LoadingTextures), false);
        assert.strictEqual (info1.overallPercentage, 100);
        
        manager.SetStage (OV.ProgressStage.Complete);
        
        let info2 = manager.GetProgressInfo ();
        let visitedStages2 = manager.GetVisitedStages ();
        let completedStages2 = manager.GetCompletedStages ();
        
        assert.strictEqual (visitedStages2.has (OV.ProgressStage.LoadingTextures), true);
        assert.strictEqual (completedStages2.has (OV.ProgressStage.LoadingTextures), true);
        assert.strictEqual (info2.overallPercentage, 100);
    });

    it ('Complete stage always returns 100%', function () {
        let manager = new OV.ProgressManager ();
        
        manager.SetStage (OV.ProgressStage.Complete);
        let info1 = manager.GetProgressInfo ();
        assert.strictEqual (info1.overallPercentage, 100);
        
        manager.SetStageProgress (0, 1);
        let info2 = manager.GetProgressInfo ();
        assert.strictEqual (info2.overallPercentage, 100);
    });

    it ('Same stage does not trigger update or change state', function () {
        let manager = new OV.ProgressManager ();
        let callCount = 0;
        
        manager.AddListener ((info) => {
            callCount++;
        });
        
        let prevCallCount = callCount;
        manager.SetStage (OV.ProgressStage.LoadingFiles);
        assert.strictEqual (callCount, prevCallCount);
    });

    it ('Progress calculation uses only stages with actual work', function () {
        let manager = new OV.ProgressManager ();
        
        manager.SetStageProgress (10, 10);
        let info1 = manager.GetProgressInfo ();
        let visitedStages1 = manager.GetVisitedStages ();
        
        assert.strictEqual (visitedStages1.size, 1);
        assert.strictEqual (visitedStages1.has (OV.ProgressStage.LoadingFiles), true);
        assert.strictEqual (info1.overallPercentage, 100);
        
        manager.SetStage (OV.ProgressStage.Parsing);
        let info2 = manager.GetProgressInfo ();
        let visitedStages2 = manager.GetVisitedStages ();
        
        assert.strictEqual (visitedStages2.size, 2);
        assert.strictEqual (visitedStages2.has (OV.ProgressStage.Parsing), true);
        
        assert.strictEqual (info2.overallPercentage, 100);
        
        manager.SetStageProgress (0, 10);
        let info3 = manager.GetProgressInfo ();
        let completedWeight = 35;
        let effectiveWeight = 35 + 25;
        let expectedProgress = (completedWeight / effectiveWeight) * 100;
        assert.strictEqual (info3.overallPercentage, expectedProgress);
    });

    it ('Progress at end does not jump when skipping stages', function () {
        let manager = new OV.ProgressManager ();
        
        manager.SetStageProgress (10, 10);
        manager.SetStage (OV.ProgressStage.Parsing);
        manager.SetStageProgress (10, 10);
        manager.SetStage (OV.ProgressStage.Converting);
        manager.SetStageProgress (10, 10);
        
        let info1 = manager.GetProgressInfo ();
        assert.strictEqual (info1.overallPercentage, 100);
        
        manager.SetStage (OV.ProgressStage.Complete);
        
        let info2 = manager.GetProgressInfo ();
        assert.strictEqual (info2.overallPercentage, 100);
        
        let visitedStages = manager.GetVisitedStages ();
        assert.strictEqual (visitedStages.has (OV.ProgressStage.Decompressing), true);
        assert.strictEqual (visitedStages.has (OV.ProgressStage.LoadingTextures), true);
    });

    it ('Progress does not jump when stage has zero total work', function () {
        let manager = new OV.ProgressManager ();
        
        manager.SetStageProgress (10, 10);
        manager.SetStage (OV.ProgressStage.Decompressing);
        manager.SetStageProgress (10, 10);
        manager.SetStage (OV.ProgressStage.Parsing);
        manager.SetStageProgress (10, 10);
        manager.SetStage (OV.ProgressStage.Converting);
        manager.SetStageProgress (10, 10);
        
        let info1 = manager.GetProgressInfo ();
        assert.strictEqual (info1.overallPercentage, 100);
        
        manager.SetStage (OV.ProgressStage.LoadingTextures);
        let info2 = manager.GetProgressInfo ();
        assert.strictEqual (info2.overallPercentage, 100);
        
        manager.SetStageProgress (0, 0);
        let info3 = manager.GetProgressInfo ();
        assert.strictEqual (info3.overallPercentage, 100);
        
        manager.SetStage (OV.ProgressStage.Complete);
        let info4 = manager.GetProgressInfo ();
        assert.strictEqual (info4.overallPercentage, 100);
    });

    it ('Progress updates correctly when stage has non-zero total work', function () {
        let manager = new OV.ProgressManager ();
        
        manager.SetStageProgress (10, 10);
        manager.SetStage (OV.ProgressStage.Parsing);
        manager.SetStageProgress (10, 10);
        manager.SetStage (OV.ProgressStage.Converting);
        manager.SetStageProgress (10, 10);
        
        let info1 = manager.GetProgressInfo ();
        assert.strictEqual (info1.overallPercentage, 100);
        
        manager.SetStage (OV.ProgressStage.LoadingTextures);
        let info2 = manager.GetProgressInfo ();
        assert.strictEqual (info2.overallPercentage, 100);
        
        manager.SetStageProgress (0, 5);
        let info3 = manager.GetProgressInfo ();
        let completedWeight = 35 + 25 + 20;
        let effectiveWeight = completedWeight + 10;
        let expectedProgress = (completedWeight / effectiveWeight) * 100;
        assert.strictEqual (info3.overallPercentage, expectedProgress);
        
        manager.SetStageProgress (5, 5);
        let info4 = manager.GetProgressInfo ();
        assert.strictEqual (info4.overallPercentage, 100);
        
        manager.SetStage (OV.ProgressStage.Complete);
        let info5 = manager.GetProgressInfo ();
        assert.strictEqual (info5.overallPercentage, 100);
    });
});

}
