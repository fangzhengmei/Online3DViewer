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

    it ('Only visited stages are counted in overall percentage', function () {
        let manager = new OV.ProgressManager ();

        manager.SetStageProgress (10, 10);
        let info1 = manager.GetProgressInfo ();
        assert.strictEqual (info1.overallPercentage, 35);

        manager.SetStage (OV.ProgressStage.Parsing);
        let visitedStages = manager.GetVisitedStages ();
        assert.strictEqual (visitedStages.has (OV.ProgressStage.LoadingFiles), true);
        assert.strictEqual (visitedStages.has (OV.ProgressStage.Parsing), true);
        assert.strictEqual (visitedStages.has (OV.ProgressStage.Decompressing), false);

        manager.SetStageProgress (0, 10);
        let info2 = manager.GetProgressInfo ();
        assert.strictEqual (info2.overallPercentage, 35);
    });

    it ('Skipping decompressing stage does not cause progress jump', function () {
        let manager = new OV.ProgressManager ();

        manager.SetStageProgress (5, 10);
        let info1 = manager.GetProgressInfo ();
        let overall1 = info1.overallPercentage;
        assert.ok (overall1 > 0 && overall1 < 100);

        manager.SetStageProgress (10, 10);
        let info2 = manager.GetProgressInfo ();
        let overall2 = info2.overallPercentage;
        assert.strictEqual (overall2, 35);

        manager.SetStage (OV.ProgressStage.Parsing);
        let info3 = manager.GetProgressInfo ();
        let overall3 = info3.overallPercentage;
        assert.ok (overall3 >= overall2, 'Progress should not decrease when skipping decompressing stage');
    });

    it ('Decompressing stage is correctly included when visited', function () {
        let manager = new OV.ProgressManager ();

        manager.SetStageProgress (10, 10);

        manager.SetStage (OV.ProgressStage.Decompressing);
        manager.SetStageProgress (10, 10);

        manager.SetStage (OV.ProgressStage.Parsing);
        manager.SetStageProgress (0, 10);

        let visitedStages = manager.GetVisitedStages ();
        assert.strictEqual (visitedStages.has (OV.ProgressStage.LoadingFiles), true);
        assert.strictEqual (visitedStages.has (OV.ProgressStage.Decompressing), true);
        assert.strictEqual (visitedStages.has (OV.ProgressStage.Parsing), true);

        let info = manager.GetProgressInfo ();
        let expectedProgress = (35 + 10) / 100 * 100;
        assert.strictEqual (info.overallPercentage, expectedProgress);
    });

    it ('Progress advances continuously through full flow', function () {
        let manager = new OV.ProgressManager ();
        let progressHistory = [];
        
        manager.AddListener ((info) => {
            progressHistory.push (info.overallPercentage);
        });
        
        manager.SetStageProgress (1, 2);
        manager.SetStageProgress (2, 2);
        manager.SetStage (OV.ProgressStage.Parsing);
        manager.SetStageProgress (1, 2);
        manager.SetStageProgress (2, 2);
        manager.SetStage (OV.ProgressStage.Converting);
        manager.SetStageProgress (1, 2);
        manager.SetStageProgress (2, 2);
        manager.SetStage (OV.ProgressStage.LoadingTextures);
        manager.SetStageProgress (1, 2);
        manager.SetStageProgress (2, 2);
        manager.SetStage (OV.ProgressStage.Complete);
        manager.SetStageProgress (1, 1);
        
        for (let i = 1; i < progressHistory.length; i++) {
            assert.ok (progressHistory[i] >= progressHistory[i - 1], 
                `Progress should not decrease: ${progressHistory[i - 1]} -> ${progressHistory[i]}`);
        }
        
        assert.strictEqual (progressHistory[progressHistory.length - 1], 100);
    });
});

}
