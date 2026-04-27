export const ProgressStage =
{
    LoadingFiles : 'loading_files',
    Decompressing : 'decompressing',
    Parsing : 'parsing',
    Converting : 'converting',
    LoadingTextures : 'loading_textures',
    Complete : 'complete'
};

const StageOrder = [
    ProgressStage.LoadingFiles,
    ProgressStage.Decompressing,
    ProgressStage.Parsing,
    ProgressStage.Converting,
    ProgressStage.LoadingTextures,
    ProgressStage.Complete
];

export class ProgressInfo
{
    constructor ()
    {
        this.stage = ProgressStage.LoadingFiles;
        this.stageProgress = 0;
        this.stageTotal = 0;
        this.stagePercentage = 0;
        this.overallPercentage = 0;
        this.currentFileName = null;
        this.details = null;
        this.bytesLoaded = 0;
        this.bytesTotal = 0;
    }

    SetStage (stage)
    {
        this.stage = stage;
        this.stageProgress = 0;
        this.stageTotal = 0;
        this.stagePercentage = 0;
        this.currentFileName = null;
        this.details = null;
    }

    SetStageProgress (progress, total)
    {
        this.stageProgress = progress;
        this.stageTotal = total;
        if (total > 0) {
            this.stagePercentage = (progress / total) * 100;
        } else {
            this.stagePercentage = 0;
        }
    }

    SetBytesProgress (loaded, total)
    {
        this.bytesLoaded = loaded;
        this.bytesTotal = total;
        if (total > 0) {
            this.stageProgress = loaded;
            this.stageTotal = total;
            this.stagePercentage = (loaded / total) * 100;
        }
    }

    SetCurrentFileName (fileName)
    {
        this.currentFileName = fileName;
    }

    SetDetails (details)
    {
        this.details = details;
    }

    Clone ()
    {
        let clone = new ProgressInfo ();
        clone.stage = this.stage;
        clone.stageProgress = this.stageProgress;
        clone.stageTotal = this.stageTotal;
        clone.stagePercentage = this.stagePercentage;
        clone.overallPercentage = this.overallPercentage;
        clone.currentFileName = this.currentFileName;
        clone.details = this.details;
        clone.bytesLoaded = this.bytesLoaded;
        clone.bytesTotal = this.bytesTotal;
        return clone;
    }
}

export class ProgressManager
{
    constructor ()
    {
        this.progressInfo = new ProgressInfo ();
        this.listeners = [];
        this.visitedStages = new Set ([ProgressStage.LoadingFiles]);
        this.completedStages = new Set ();
        this.stageWeights = new Map ([
            [ProgressStage.LoadingFiles, 35],
            [ProgressStage.Decompressing, 10],
            [ProgressStage.Parsing, 25],
            [ProgressStage.Converting, 20],
            [ProgressStage.LoadingTextures, 10]
        ]);
        this.totalWeightSum = 100;
    }

    AddListener (listener)
    {
        this.listeners.push (listener);
    }

    RemoveListener (listener)
    {
        const index = this.listeners.indexOf (listener);
        if (index !== -1) {
            this.listeners.splice (index, 1);
        }
    }

    NotifyListeners ()
    {
        for (let listener of this.listeners) {
            listener (this.progressInfo.Clone ());
        }
    }

    MarkSkippedStages (newStage)
    {
        const newStageIndex = StageOrder.indexOf (newStage);
        const currentStageIndex = StageOrder.indexOf (this.progressInfo.stage);

        for (let i = currentStageIndex + 1; i < newStageIndex; i++) {
            const skippedStage = StageOrder[i];
            if (!this.visitedStages.has (skippedStage) && this.stageWeights.has (skippedStage)) {
                this.visitedStages.add (skippedStage);
                this.completedStages.add (skippedStage);
            }
        }
    }

    SetStage (stage)
    {
        if (stage === this.progressInfo.stage) {
            return;
        }

        this.MarkSkippedStages (stage);

        const prevStage = this.progressInfo.stage;
        if (this.stageWeights.has (prevStage)) {
            this.completedStages.add (prevStage);
        }

        this.visitedStages.add (stage);
        this.progressInfo.SetStage (stage);
        this.CalculateOverallPercentage ();
        this.NotifyListeners ();
    }

    SetStageProgress (progress, total)
    {
        this.progressInfo.SetStageProgress (progress, total);
        this.CalculateOverallPercentage ();
        this.NotifyListeners ();
    }

    SetBytesProgress (loaded, total)
    {
        this.progressInfo.SetBytesProgress (loaded, total);
        this.CalculateOverallPercentage ();
        this.NotifyListeners ();
    }

    SetCurrentFileName (fileName)
    {
        this.progressInfo.SetCurrentFileName (fileName);
        this.NotifyListeners ();
    }

    SetDetails (details)
    {
        this.progressInfo.SetDetails (details);
        this.NotifyListeners ();
    }

    GetProgressInfo ()
    {
        return this.progressInfo.Clone ();
    }

    GetVisitedStages ()
    {
        return new Set (this.visitedStages);
    }

    GetCompletedStages ()
    {
        return new Set (this.completedStages);
    }

    CalculateOverallPercentage ()
    {
        if (this.progressInfo.stage === ProgressStage.Complete) {
            this.progressInfo.overallPercentage = 100;
            return;
        }

        let completedWeight = 0;
        for (let stage of this.completedStages) {
            const weight = this.stageWeights.get (stage) || 0;
            completedWeight += weight;
        }

        const currentStage = this.progressInfo.stage;
        const currentWeight = this.stageWeights.get (currentStage) || 0;
        const currentContrib = currentWeight * (this.progressInfo.stagePercentage / 100);

        this.progressInfo.overallPercentage = ((completedWeight + currentContrib) / this.totalWeightSum) * 100;
    }

    Reset ()
    {
        this.progressInfo = new ProgressInfo ();
        this.visitedStages = new Set ([ProgressStage.LoadingFiles]);
        this.completedStages = new Set ();
        this.NotifyListeners ();
    }
}

export function FormatFileSize (bytes)
{
    if (bytes === 0) {
        return '0 B';
    }
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor (Math.log (bytes) / Math.log (k));
    return parseFloat ((bytes / Math.pow (k, i)).toFixed (2)) + ' ' + sizes[i];
}

export function FormatPercentage (percentage)
{
    return percentage.toFixed (1) + '%';
}
