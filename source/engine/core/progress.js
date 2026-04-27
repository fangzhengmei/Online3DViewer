export const ProgressStage =
{
    LoadingFiles : 'loading_files',
    Decompressing : 'decompressing',
    Parsing : 'parsing',
    Converting : 'converting',
    Visualizing : 'visualizing',
    LoadingTextures : 'loading_textures',
    Complete : 'complete'
};

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
        this.stageWeights = new Map ([
            [ProgressStage.LoadingFiles, 30],
            [ProgressStage.Decompressing, 10],
            [ProgressStage.Parsing, 25],
            [ProgressStage.Converting, 20],
            [ProgressStage.Visualizing, 10],
            [ProgressStage.LoadingTextures, 5]
        ]);
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

    SetStage (stage)
    {
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

    CalculateOverallPercentage ()
    {
        let totalWeight = 0;
        let weightedProgress = 0;

        const stageOrder = [
            ProgressStage.LoadingFiles,
            ProgressStage.Decompressing,
            ProgressStage.Parsing,
            ProgressStage.Converting,
            ProgressStage.Visualizing,
            ProgressStage.LoadingTextures
        ];

        const currentStageIndex = stageOrder.indexOf (this.progressInfo.stage);

        for (let i = 0; i < stageOrder.length; i++) {
            const stage = stageOrder[i];
            const weight = this.stageWeights.get (stage) || 0;
            totalWeight += weight;

            if (i < currentStageIndex) {
                weightedProgress += weight * 100;
            } else if (i === currentStageIndex) {
                weightedProgress += weight * this.progressInfo.stagePercentage;
            }
        }

        if (totalWeight > 0) {
            this.progressInfo.overallPercentage = weightedProgress / totalWeight;
        } else {
            this.progressInfo.overallPercentage = this.progressInfo.stagePercentage;
        }
    }

    Reset ()
    {
        this.progressInfo = new ProgressInfo ();
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
