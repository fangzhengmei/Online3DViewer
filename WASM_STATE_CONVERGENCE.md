# Online3DViewer WebAssembly 统一状态收敛准则

> 本文档是 [WASM_INTEGRATION_ANALYSIS.md](./WASM_INTEGRATION_ANALYSIS.md) 和 [WASM_FAILURE_ANALYSIS.md](./WASM_FAILURE_ANALYSIS.md) 的架构规范补充，定义了一套可执行的状态机模型来统一处理四类失败场景。

---

## 1. 设计原则

### 1.1 核心准则

| 准则 | 说明 | 执行方式 |
|------|------|----------|
| **单进单出** | 任何时刻只能有一个活跃的导入操作 | 世代计数器 + 状态锁 |
| **状态可追溯** | 每个操作的当前状态必须明确 | 显式状态枚举 |
| **错误必收敛** | 所有失败路径必须到达确定的终止状态 | 强制状态迁移规则 |
| **资源必回收** | 离开活跃状态时必须清理已分配资源 | 状态退出钩子 |
| **旧调必作废** | 过期异步回调必须被静默忽略 | 世代校验机制 |

### 1.2 问题根因总结

当前实现的核心问题：

```
┌─────────────────────────────────────────────────────────────────┐
│                        当前问题架构                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 无显式状态机                                                │
│     └── 状态分散在 this.error / this.model / this.callbacks    │
│         无法原子性地判断当前状态                                │
│                                                                 │
│  2. Promise 链断裂                                              │
│     └── 内部 Promise 没有被 return                              │
│         .catch() 无法捕获所有错误                               │
│                                                                 │
│  3. 无世代保护                                                  │
│     └── 异步回调捕获的变量在执行时可能已失效                    │
│         旧回调污染新导入的状态                                  │
│                                                                 │
│  4. 资源清理时机不明确                                          │
│     └── Clear() 只在 Import() 开始和 onComplete 时调用        │
│         失败路径中的清理依赖回调正确触发                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 统一状态机模型

### 2.1 状态定义

```javascript
export const ImportState =
{
    /** 初始状态，无活跃导入 */
    IDLE : 'IDLE',

    /** 正在加载外部脚本 (LoadExternalLibrary) */
    LOADING_SCRIPT : 'LOADING_SCRIPT',

    /** 正在初始化 WASM 实例 (rhino3dm() / ifc.Init() / Worker 创建) */
    INITIALIZING_WASM : 'INITIALIZING_WASM',

    /** 正在解析模型内容 */
    PARSING : 'PARSING',

    /** 正在处理 Worker 消息循环 (ImporterFcstd 多对象场景) */
    PROCESSING_WORKER_LOOP : 'PROCESSING_WORKER_LOOP',

    /** 操作成功完成 */
    SUCCESS : 'SUCCESS',

    /** 操作失败 */
    FAILED : 'FAILED',

    /** 操作被用户取消 */
    CANCELLED : 'CANCELLED'
};
```

### 2.2 状态分类

| 类别 | 状态 | 特性 |
|------|------|------|
| **稳定态** | `IDLE`, `SUCCESS`, `FAILED`, `CANCELLED` | 不等待异步操作，可接受新操作 |
| **活跃态** | `LOADING_SCRIPT`, `INITIALIZING_WASM`, `PARSING`, `PROCESSING_WORKER_LOOP` | 等待异步操作，不可接受新操作 |
| **终止态** | `SUCCESS`, `FAILED`, `CANCELLED` | 导入操作已结束，需清理后回到 `IDLE` |

### 2.3 状态机图

```
                    ┌──────────────────────────────────────────────────────┐
                    │                      事件流                           │
                    └──────────────────────────────────────────────────────┘

                              ┌──────────────┐
                              │    IDLE      │
                              │   (稳定态)    │
                              └──────┬───────┘
                                     │
                         Import() 开始
                                     │
                                     ▼
                              ┌──────────────┐
                    ┌─────────│LOADING_SCRIPT│──────────┐
                    │         │  (活跃态)    │          │
                    │         └──────┬───────┘          │
                    │                │                   │
                    │      脚本加载成功                脚本加载失败
                    │                │                   │
                    │                ▼                   ▼
                    │         ┌──────────────┐    ┌──────────────┐
                    │         │INITIALIZING_ │    │   FAILED     │
                    │         │    WASM      │───▶│  (终止态)    │
                    │         │  (活跃态)    │    └──────────────┘
                    │         └──────┬───────┘
                    │                │
                    │      WASM 初始化成功         WASM 初始化失败
                    │                │                   │
                    │                ▼                   ▼
                    │         ┌──────────────┐    ┌──────────────┐
                    │         │   PARSING    │    │   FAILED     │
              Worker│         │  (活跃态)    │───▶│  (终止态)    │
              模式  │         └──────┬───────┘    └──────────────┘
                    │                │
                    │         多对象处理?
                    │           /       \
                    │         否         是
                    │         │           │
                    │         ▼           ▼
                    │    ┌─────────┐ ┌───────────────┐
                    │    │ SUCCESS │ │PROCESSING_    │
                    │    │(终止态) │ │WORKER_LOOP    │
                    │    └─────────┘ │  (活跃态)     │
                    │                └───────┬───────┘
                    │                        │
                    │         处理完成 / Worker 错误
                    │                        │
                    │                        ▼
                    │                 ┌───────────────┐
                    │                 │ SUCCESS/      │
                    │                 │ FAILED        │
                    │                 │  (终止态)      │
                    │                 └───────────────┘
                    │
                    └──────────────────────────────────────────┐
                                                               │
              ┌────────────────────────────────────────────────┐
              │              取消路径 (任意活跃态)              │
              ├────────────────────────────────────────────────┤
              │                                                │
              │  任何活跃态 + Cancel() 事件                    │
              │         │                                      │
              │         ▼                                      │
              │  ┌──────────────┐                              │
              │  │  CANCELLED   │                              │
              │  │  (终止态)    │                              │
              │  └──────────────┘                              │
              │                                                │
              └────────────────────────────────────────────────┘

                    ┌──────────────────────────────────────────────────────┐
                    │                    终止态后处理                        │
                    ├────────────────────────────────────────────────────────┤
                    │                                                        │
                    │  SUCCESS / FAILED / CANCELLED                         │
                    │           │                                            │
                    │           ▼                                            │
                    │  onSuccess / onError / onCancel                       │
                    │           │                                            │
                    │           ▼                                            │
                    │      onComplete (必触发)                                │
                    │           │                                            │
                    │           ▼                                            │
                    │   Clear() → 回到 IDLE                                  │
                    │                                                        │
                    └────────────────────────────────────────────────────────┘
```

---

## 3. 事件定义与触发条件

### 3.1 四类事件的规范定义

```javascript
export const ImportEvent =
{
    /** 导入操作启动 */
    START : 'START',

    /** 外部脚本加载完成 */
    SCRIPT_LOADED : 'SCRIPT_LOADED',

    /** WASM 实例初始化完成 */
    WASM_INITIALIZED : 'WASM_INITIALIZED',

    /** 解析完成 */
    PARSE_COMPLETE : 'PARSE_COMPLETE',

    /** Worker 单对象处理完成 (ImporterFcstd) */
    WORKER_ITEM_COMPLETE : 'WORKER_ITEM_COMPLETE',

    /** Worker 循环全部完成 */
    WORKER_LOOP_COMPLETE : 'WORKER_LOOP_COMPLETE',

    /** 加载失败 (脚本/WASM) */
    LOAD_FAILED : 'LOAD_FAILED',

    /** 初始化失败 (WASM 实例化) */
    INIT_FAILED : 'INIT_FAILED',

    /** 解析失败 */
    PARSE_FAILED : 'PARSE_FAILED',

    /** Worker 异常 */
    WORKER_ERROR : 'WORKER_ERROR',

    /** 用户取消 */
    CANCEL : 'CANCEL',

    /** 清理完成 */
    CLEAR_COMPLETE : 'CLEAR_COMPLETE'
};
```

### 3.2 四类失败事件的触发条件

| 事件类型 | 触发条件 | 对应代码场景 | 错误码 |
|---------|---------|-------------|--------|
| **LOAD_FAILED** | 外部脚本加载失败 | `scriptElement.onerror`, `fetch !ok`, `XMLHttpRequest.onerror` | `ImportErrorCode.FailedToLoadFile` |
| **INIT_FAILED** | WASM 实例化失败 | `rhino3dm()` reject, `ifc.Init()` reject, `Worker.onerror` 创建阶段 | `ImportErrorCode.ImportFailed` |
| **WORKER_ERROR** | Worker 运行时异常 | `worker.addEventListener('error', ...)` 在 `PROCESSING_WORKER_LOOP` 状态 | `ImportErrorCode.ImportFailed` |
| **CANCEL** | 用户主动取消 | 调用 `Cancel()` API, 或多文件选择时返回 `null` | `ImportErrorCode.NoImportableFile` (用于选择取消) 或新错误码 |

### 3.3 事件触发的规范代码示例

#### 错误的 Promise 处理 (当前实现)

```javascript
// ❌ 当前实现：内部 Promise 没有被 return
LoadExternalLibrary ('rhino3dm').then (() => {
    rhino3dm ().then ((rhino) => {  // 这个 Promise 没有被 return
        // ...
    });
    // 没有 .catch()
}).catch (() => {
    // 只能捕获 LoadExternalLibrary 的失败
    // 无法捕获 rhino3dm() 的失败
});
```

#### 正确的 Promise 处理 (规范实现)

```javascript
// ✅ 规范实现：正确 return + 统一事件触发
LoadExternalLibrary ('rhino3dm')
    .then (() => {
        // 脚本加载成功，触发事件
        this.HandleEvent (ImportEvent.SCRIPT_LOADED);
        // return 内部 Promise，使错误能被后续 .catch() 捕获
        return rhino3dm ();
    })
    .then ((rhino) => {
        // WASM 初始化成功
        this.wasmInstance = rhino;
        this.HandleEvent (ImportEvent.WASM_INITIALIZED);
        // 继续解析
        return this.DoParse ();
    })
    .then (() => {
        this.HandleEvent (ImportEvent.PARSE_COMPLETE);
    })
    .catch ((error) => {
        // 统一错误处理：判断错误类型并触发对应事件
        if (error.type === 'LoadError') {
            this.HandleEvent (ImportEvent.LOAD_FAILED, error);
        } else if (error.type === 'InitError') {
            this.HandleEvent (ImportEvent.INIT_FAILED, error);
        } else {
            this.HandleEvent (ImportEvent.PARSE_FAILED, error);
        }
    });
```

---

## 4. 状态迁移规则

### 4.1 迁移规则表

| 当前状态 | 事件 | 目标状态 | 操作 |
|---------|------|---------|------|
| `IDLE` | `START` | `LOADING_SCRIPT` | 需要 WASM 的格式 |
| `IDLE` | `START` | `PARSING` | 纯 JS 格式 (obj, stl 等) |
| `LOADING_SCRIPT` | `SCRIPT_LOADED` | `INITIALIZING_WASM` | 开始 WASM 实例化 |
| `LOADING_SCRIPT` | `LOAD_FAILED` | `FAILED` | 记录错误，准备回调 |
| `LOADING_SCRIPT` | `CANCEL` | `CANCELLED` | 终止网络请求 |
| `INITIALIZING_WASM` | `WASM_INITIALIZED` | `PARSING` | 开始解析 |
| `INITIALIZING_WASM` | `INIT_FAILED` | `FAILED` | 记录错误 |
| `INITIALIZING_WASM` | `CANCEL` | `CANCELLED` | - |
| `PARSING` | `PARSE_COMPLETE` | `SUCCESS` | 准备成功回调 |
| `PARSING` | `PARSE_COMPLETE` | `PROCESSING_WORKER_LOOP` | 多对象场景切换 |
| `PARSING` | `PARSE_FAILED` | `FAILED` | 记录错误 |
| `PARSING` | `CANCEL` | `CANCELLED` | - |
| `PROCESSING_WORKER_LOOP` | `WORKER_ITEM_COMPLETE` | `PROCESSING_WORKER_LOOP` | 继续发送下一个 |
| `PROCESSING_WORKER_LOOP` | `WORKER_LOOP_COMPLETE` | `SUCCESS` | 全部完成 |
| `PROCESSING_WORKER_LOOP` | `WORKER_ERROR` | `FAILED` | 终止循环，记录错误 |
| `PROCESSING_WORKER_LOOP` | `CANCEL` | `CANCELLED` | 终止 Worker |
| `SUCCESS` | `CLEAR_COMPLETE` | `IDLE` | 清理完成 |
| `FAILED` | `CLEAR_COMPLETE` | `IDLE` | 清理完成 |
| `CANCELLED` | `CLEAR_COMPLETE` | `IDLE` | 清理完成 |

### 4.2 活跃态迁移约束

**规则**: 活跃态下，只有特定事件可以触发迁移，其他事件必须被忽略或排队。

```javascript
/**
 * 核心事件处理器
 * 这是状态机的唯一入口
 */
HandleEvent (event, eventData = null)
{
    // 1. 世代校验：如果不是当前世代，静默忽略
    if (eventData && eventData.generation !== this.importGeneration) {
        console.warn (`Ignoring stale event ${event} from generation ${eventData.generation}`);
        return;
    }

    // 2. 状态锁：活跃态下只能接受特定事件
    const currentState = this.state;
    const isActiveState = this.IsActiveState (currentState);

    // 取消事件是例外：任何状态都可以处理
    if (event === ImportEvent.CANCEL) {
        if (isActiveState) {
            this.DoCancel ();
            this.TransitionTo (ImportState.CANCELLED);
        }
        return;
    }

    // 3. 查找迁移规则
    const transition = this.FindTransition (currentState, event);
    if (!transition) {
        console.warn (`Unexpected event ${event} in state ${currentState}`);
        return;
    }

    // 4. 执行迁移前操作
    this.BeforeTransition (currentState, transition.targetState);

    // 5. 状态迁移
    this.state = transition.targetState;

    // 6. 执行迁移后操作
    this.AfterTransition (currentState, transition.targetState, eventData);
}
```

### 4.3 状态进入/退出钩子

```javascript
/**
 * 状态退出钩子：离开当前状态时调用
 * 用于资源清理
 */
BeforeTransition (fromState, toState)
{
    // 从活跃态退出时，必须清理已分配的资源
    if (this.IsActiveState (fromState)) {
        switch (fromState) {
            case ImportState.LOADING_SCRIPT:
                // 终止挂起的网络请求（如果有可取消的 API）
                // 注意：动态 script 标签无法取消，只能忽略后续事件
                break;

            case ImportState.INITIALIZING_WASM:
                // WASM 实例化无法中断，只能忽略结果
                break;

            case ImportState.PARSING:
                // 同步解析无法中断，Worker 模式需要 terminate
                if (this.worker !== null) {
                    this.worker.terminate ();
                    this.worker = null;
                }
                break;

            case ImportState.PROCESSING_WORKER_LOOP:
                // Worker 循环必须终止
                if (this.worker !== null) {
                    this.worker.terminate ();
                    this.worker = null;
                }
                // 移除事件监听器
                if (this.workerMessageHandler) {
                    this.worker.removeEventListener ('message', this.workerMessageHandler);
                    this.worker.removeEventListener ('error', this.workerErrorHandler);
                }
                break;
        }
    }
}

/**
 * 状态进入钩子：进入新状态时调用
 * 用于触发回调和最终清理
 */
AfterTransition (fromState, toState, eventData)
{
    // 进入终止态时，触发对应的回调
    if (this.IsTerminalState (toState)) {
        switch (toState) {
            case ImportState.SUCCESS:
                if (this.callbacks && this.callbacks.onSuccess) {
                    this.callbacks.onSuccess ();
                }
                break;

            case ImportState.FAILED:
                this.error = true;
                this.errorData = eventData;
                if (this.callbacks && this.callbacks.onError) {
                    this.callbacks.onError ();
                }
                break;

            case ImportState.CANCELLED:
                if (this.callbacks && this.callbacks.onCancel) {
                    this.callbacks.onCancel ();
                }
                break;
        }

        // 终止态必须触发 onComplete
        if (this.callbacks && this.callbacks.onComplete) {
            this.callbacks.onComplete ();
        }

        // 触发清理，回到 IDLE
        this.Clear ();
        this.HandleEvent (ImportEvent.CLEAR_COMPLETE);
    }
}
```

---

## 5. 错误回传口径规范

### 5.1 扩展错误码体系

```javascript
export const ImportErrorCode =
{
    // 原有错误码
    NoImportableFile : 1,      // 无可导入文件 / 用户取消选择
    FailedToLoadFile : 2,      // 文件加载失败
    ImportFailed : 3,          // 导入失败（通用）
    UnknownError : 4,          // 未知错误

    // 新增细分错误码
    ScriptLoadFailed : 101,    // 外部脚本加载失败
    WasmInitFailed : 102,      // WASM 实例化失败
    WorkerError : 103,         // Worker 运行时异常
    UserCancelled : 104,       // 用户主动取消
    ParseError : 105,          // 内容解析错误
    Timeout : 106              // 操作超时
};
```

### 5.2 错误对象规范

```javascript
export class ImportError
{
    constructor (code)
    {
        // 错误码（必须）
        this.code = code;

        // 关联的主文件名（可选）
        this.mainFile = null;

        // 用户可读错误消息（可选）
        this.message = null;

        // 技术细节（用于调试，不显示给用户）
        this.details = {
            // 失败时的状态
            stateAtFailure : null,

            // 失败时的世代
            generation : null,

            // 原始错误对象（如 Error 事件、Promise rejection reason）
            cause : null,

            // 时间戳
            timestamp : Date.now ()
        };
    }
}
```

### 5.3 四类失败的错误映射

| 失败类型 | 错误码 | message 模板 | details.stateAtFailure |
|---------|--------|--------------|------------------------|
| **脚本加载失败** | `ScriptLoadFailed` (101) | `"Failed to load {libraryName} from {url}"` | `LOADING_SCRIPT` |
| **WASM 初始化失败** | `WasmInitFailed` (102) | `"Failed to initialize {libraryName} WebAssembly module"` | `INITIALIZING_WASM` |
| **Worker 异常** | `WorkerError` (103) | `"Worker error during processing: {errorMessage}"` | `PROCESSING_WORKER_LOOP` 或 `PARSING` |
| **用户取消** | `UserCancelled` (104) | `"Import cancelled by user"` | 任何活跃态 |
| **解析失败** | `ParseError` (105) | `"Failed to parse {fileName}: {reason}"` | `PARSING` |

### 5.4 错误回传流程

```
┌─────────────────────────────────────────────────────────────────┐
│                      错误回传流程                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 错误发生                                                     │
│      │                                                          │
│      ▼                                                          │
│  2. HandleEvent(LOAD_FAILED / INIT_FAILED / WORKER_ERROR)     │
│      │                                                          │
│      ▼                                                          │
│  3. 状态迁移到 FAILED                                            │
│      │                                                          │
│      ├──▶ BeforeTransition()                                   │
│      │       └── 清理活跃资源 (Worker terminate, 等)           │
│      │                                                          │
│      ├──▶ this.error = true                                    │
│      │                                                          │
│      └──▶ this.errorData = {                                   │
│              code: ImportErrorCode.XxxFailed,                  │
│              message: '...',                                    │
│              details: { ... }                                   │
│           }                                                     │
│      │                                                          │
│      ▼                                                          │
│  4. AfterTransition()                                           │
│      │                                                          │
│      ├──▶ callbacks.onError()                                  │
│      │       └── 上层创建 ImportError 对象                     │
│      │                                                          │
│      └──▶ callbacks.onComplete()                               │
│              └── 保证回调契约                                   │
│      │                                                          │
│      ▼                                                          │
│  5. Clear()                                                     │
│      │                                                          │
│      ├──▶ ClearContent()                                       │
│      │       └── 子类特定资源清理                               │
│      │                                                          │
│      └──▶ 状态回到 IDLE                                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. 资源回收时点规范

### 6.1 资源类型与回收时机

| 资源类型 | 分配时机 | 回收时机 | 回收方式 |
|---------|---------|---------|---------|
| **动态 script 标签** | `LOADING_SCRIPT` 入口 | `Clear()` 或世代作废 | 无法主动移除，依赖事件过滤 |
| **WASM 单例实例** | `INITIALIZING_WASM` 成功 | `Dispose()` 显式调用 | （通常不回收，设计选择） |
| **Worker 实例** | `INITIALIZING_WASM` 或 `PARSING` | `BeforeTransition()` 离开活跃态 | `worker.terminate()` |
| **Worker 事件监听器** | Worker 创建时 | `BeforeTransition()` 离开 `PROCESSING_WORKER_LOOP` | `removeEventListener` |
| **Blob URL** (occtWorkerUrl) | `CreateOcctWorker()` 首次 | 页面卸载或 `Dispose()` | `URL.revokeObjectURL()` |
| **Model 对象** | `Import()` 开始 | `Clear()` | 引用置 `null`，GC 回收 |
| **回调引用** | `Import()` 开始 | `Clear()` | 引用置 `null` |

### 6.2 关键回收代码示例

#### Worker 资源的正确回收

```javascript
// ImporterOcct / ImporterFcstd 的 ClearContent
ClearContent ()
{
    // 1. 终止 Worker
    if (this.worker !== null) {
        // 移除事件监听器（关键！防止内存泄漏）
        if (this.workerMessageHandler) {
            this.worker.removeEventListener ('message', this.workerMessageHandler);
            this.worker.removeEventListener ('error', this.workerErrorHandler);
        }
        // 终止 Worker
        this.worker.terminate ();
        this.worker = null;
        this.workerMessageHandler = null;
        this.workerErrorHandler = null;
    }

    // 2. 重置循环状态 (ImporterFcstd)
    this.currentObjectIndex = 0;
    this.objectsToProcess = null;
    this.isWorkerDead = false;
}
```

#### 全局 Blob URL 的清理

```javascript
// importerutils.js 中新增
export function DisposeOcctWorkerCache ()
{
    if (occtWorkerUrl !== null) {
        URL.revokeObjectURL (occtWorkerUrl);
        occtWorkerUrl = null;
    }
}

// 各导入器的 Dispose 方法
export class ImporterOcct extends ImporterBase
{
    Dispose ()
    {
        this.ClearContent ();
        // 注意：不建议在这里调用 DisposeOcctWorkerCache()
        // 因为其他导入器可能还需要使用
    }
}

// 应用层统一清理
export function DisposeAllWasmResources ()
{
    DisposeOcctWorkerCache ();
    // 其他全局资源清理...
}
```

### 6.3 回收时机状态表

| 当前状态 | 事件 | 回收操作 |
|---------|------|---------|
| 任何活跃态 | `CANCEL` | `BeforeTransition()` 中清理 Worker 等 |
| 任何活跃态 | 失败事件 | `BeforeTransition()` 中清理 |
| `SUCCESS` | `CLEAR_COMPLETE` | `Clear()` 清理所有非单例资源 |
| `FAILED` | `CLEAR_COMPLETE` | `Clear()` 清理所有非单例资源 |
| `CANCELLED` | `CLEAR_COMPLETE` | `Clear()` 清理所有非单例资源 |

---

## 7. 防回调污染机制（世代计数器）

### 7.1 问题场景重现

```
时序示例：重叠导入

t0: Import('large.3dm') 开始
    └── generation = 1
    └── 状态 = LOADING_SCRIPT
    └── LoadExternalLibrary('rhino3dm') 发起网络请求

t1: 用户不耐烦，选择 'simple.stl'
    └── Import('simple.stl') 开始
    └── generation = 2  (递增)
    └── Clear() 被调用
    └── 旧的 callbacks 被置 null
    └── 状态 = PARSING (stl 不需要 WASM)

t2: stl 解析快速完成
    └── 状态 = SUCCESS
    └── onSuccess / onComplete 被调用
    └── 用户看到模型

t3: 此时 rhino3dm 脚本终于加载完成
    └── 旧的 .then() 回调执行！
    └── 问题：
        - this.callbacks 已经是新的（或 null）
        - 但回调捕获的是旧的变量
        - 可能写入错误的 this.model
        - 可能触发错误的回调
```

### 7.2 世代计数器设计

```javascript
export class ImporterBase
{
    constructor ()
    {
        // ... 原有属性

        /**
         * 世代计数器
         * 每次 Import() 或 Clear() 时递增
         * 用于识别过期的异步回调
         */
        this.importGeneration = 0;

        /**
         * 当前状态
         */
        this.state = ImportState.IDLE;

        /**
         * WASM 单例实例（由子类管理）
         */
        this.wasmInstance = null;

        /**
         * Worker 实例（由子类管理）
         */
        this.worker = null;
    }

    Import (name, extension, content, callbacks)
    {
        // 1. 世代递增：使之前的所有异步回调作废
        this.importGeneration += 1;
        const currentGeneration = this.importGeneration;

        // 2. 标准清理
        this.Clear ();

        // 3. 状态初始化
        this.state = this.DetermineInitialState (extension);
        this.callbacks = callbacks;
        this.model = new Model ();
        this.error = false;
        this.errorData = null;

        // 4. 重置子类内容
        this.ResetContent ();

        // 5. 开始导入，传入世代信息
        this.ImportContent (content, currentGeneration, () => {
            // 完成回调：再次校验世代
            if (this.importGeneration !== currentGeneration) {
                console.warn ('Ignoring completion from stale generation');
                return;
            }
            this.CreateResult (callbacks, currentGeneration);
        });
    }

    Clear ()
    {
        // 世代递增：使之前的所有异步回调作废
        this.importGeneration += 1;

        // 原有清理逻辑
        this.name = null;
        this.extension = null;
        this.callbacks = null;
        this.model = null;
        this.error = null;
        this.message = null;
        this.errorData = null;
        this.state = ImportState.IDLE;

        this.ClearContent ();
    }

    /**
     * 检查当前操作是否仍然有效
     * 异步回调开始时必须调用
     */
    IsCurrentGeneration (checkGeneration)
    {
        return this.importGeneration === checkGeneration;
    }

    /**
     * 包装回调函数，添加世代校验
     */
    WrapCallback (callback, generation)
    {
        if (!callback) {
            return null;
        }
        return (...args) => {
            if (!this.IsCurrentGeneration (generation)) {
                console.warn ('Ignoring callback from stale generation');
                return;
            }
            return callback (...args);
        };
    }
}
```

### 7.3 异步操作的世代保护模式

#### 模式 A: Promise 链中的世代校验

```javascript
// 修正后的 Importer3dm.ImportContent
ImportContent (fileContent, generation, onFinish)
{
    // 立即包装 onFinish，确保最终回调有世代保护
    const protectedOnFinish = this.WrapCallback (onFinish, generation);

    if (this.wasmInstance === null) {
        LoadExternalLibrary ('rhino3dm')
            .then (() => {
                // 每次异步回调开始时校验世代
                if (!this.IsCurrentGeneration (generation)) {
                    return;  // 静默返回
                }
                // return 内部 Promise，使错误能被捕获
                return rhino3dm ();
            })
            .then ((rhino) => {
                if (!this.IsCurrentGeneration (generation)) {
                    return;
                }
                this.wasmInstance = rhino;
                this.HandleEvent (ImportEvent.WASM_INITIALIZED, { generation });
                this.ImportRhinoContent (fileContent, generation);
                protectedOnFinish ();
            })
            .catch ((error) => {
                if (!this.IsCurrentGeneration (generation)) {
                    return;
                }
                // 根据错误类型决定事件
                const event = this.DetermineErrorEvent (error);
                this.HandleEvent (event, { generation, error });
                protectedOnFinish ();
            });
    } else {
        // WASM 已初始化，直接解析
        this.ImportRhinoContent (fileContent, generation);
        protectedOnFinish ();
    }
}
```

#### 模式 B: Worker 消息中的世代校验

```javascript
// 修正后的 ImporterOcct.ImportContent
ImportContent (fileContent, generation, onFinish)
{
    const protectedOnFinish = this.WrapCallback (onFinish, generation);

    CreateOcctWorker ().then ((worker) => {
        if (!this.IsCurrentGeneration (generation)) {
            worker.terminate ();  // 世代已变，立即终止
            return;
        }

        this.worker = worker;

        // 创建带世代保护的消息处理器
        const messageHandler = (ev) => {
            if (!this.IsCurrentGeneration (generation)) {
                return;
            }
            this.ImportResultJson (ev.data, generation);
            protectedOnFinish ();
        };

        const errorHandler = (ev) => {
            if (!this.IsCurrentGeneration (generation)) {
                return;
            }
            this.HandleEvent (ImportEvent.WORKER_ERROR, {
                generation,
                error: ev
            });
            protectedOnFinish ();
        };

        // 保存处理器引用，用于后续移除
        this.workerMessageHandler = messageHandler;
        this.workerErrorHandler = errorHandler;

        worker.addEventListener ('message', messageHandler);
        worker.addEventListener ('error', errorHandler);

        // 发送消息
        worker.postMessage ({
            format : format,
            buffer : fileBuffer,
            params : params
        });
    }).catch ((error) => {
        if (!this.IsCurrentGeneration (generation)) {
            return;
        }
        this.HandleEvent (ImportEvent.LOAD_FAILED, { generation, error });
        protectedOnFinish ();
    });
}
```

#### 模式 C: Worker 循环的世代保护 (ImporterFcstd)

```javascript
// 修正后的 ImporterFcstd.ConvertObjects
ConvertObjects (objects, generation, onFinish)
{
    const protectedOnFinish = this.WrapCallback (onFinish, generation);
    let convertedObjectCount = 0;
    let isCancelled = false;

    CreateOcctWorker ().then ((worker) => {
        if (!this.IsCurrentGeneration (generation)) {
            worker.terminate ();
            return;
        }

        this.worker = worker;

        const processNext = () => {
            if (!this.IsCurrentGeneration (generation) || isCancelled) {
                worker.terminate ();
                return;
            }

            if (convertedObjectCount >= objects.length) {
                // 全部完成
                this.HandleEvent (ImportEvent.WORKER_LOOP_COMPLETE, { generation });
                protectedOnFinish ();
                return;
            }

            let currentObject = objects[convertedObjectCount];
            worker.postMessage ({
                format : 'brep',
                buffer : currentObject.fileContent
            });
        };

        const messageHandler = (ev) => {
            if (!this.IsCurrentGeneration (generation)) {
                return;
            }

            if (ev.data !== null && ev.data.success) {
                let currentObject = objects[convertedObjectCount];
                this.OnFileConverted (currentObject, ev.data, colorToMaterial);
            } else {
                // 单个对象失败，记录但继续
                console.warn ('Object conversion failed, continuing...');
            }

            convertedObjectCount += 1;
            this.HandleEvent (ImportEvent.WORKER_ITEM_COMPLETE, {
                generation,
                index: convertedObjectCount
            });

            processNext ();  // 继续处理下一个
        };

        const errorHandler = (ev) => {
            if (!this.IsCurrentGeneration (generation)) {
                return;
            }

            isCancelled = true;
            this.HandleEvent (ImportEvent.WORKER_ERROR, {
                generation,
                error: ev,
                failedIndex: convertedObjectCount
            });
            protectedOnFinish ();
        };

        this.workerMessageHandler = messageHandler;
        this.workerErrorHandler = errorHandler;

        worker.addEventListener ('message', messageHandler);
        worker.addEventListener ('error', errorHandler);

        // 开始处理第一个
        processNext ();
    }).catch ((error) => {
        if (!this.IsCurrentGeneration (generation)) {
            return;
        }
        this.HandleEvent (ImportEvent.LOAD_FAILED, { generation, error });
        protectedOnFinish ();
    });
}
```

### 7.4 世代保护的效果

```
应用世代保护后的时序：

t0: Import('large.3dm')
    └── generation = 1

t1: LoadExternalLibrary 发起请求 (捕获 generation=1)

t2: Import('simple.stl')
    └── generation = 2 (递增!)
    └── 旧的回调现在都"过期"了

t3: stl 完成，用户看到模型

t4: rhino3dm 脚本加载完成，旧回调执行
    └── if (!this.IsCurrentGeneration(1)) → false!
    └── 静默 return，什么都不做
    └── 不会污染新导入的状态！

结果：
✓ 旧回调被静默忽略
✓ 新导入的状态不受影响
✓ 用户体验一致
```

---

## 8. 完整重构示例代码

### 8.1 修正后的 ImporterBase

```javascript
import { Direction } from '../geometry/geometry.js';
import { Model } from '../model/model.js';
import { FinalizeModel } from '../model/modelfinalization.js';
import { IsModelEmpty } from '../model/modelutils.js';
import { Loc } from '../core/localization.js';

export const ImportState =
{
    IDLE : 'IDLE',
    LOADING_SCRIPT : 'LOADING_SCRIPT',
    INITIALIZING_WASM : 'INITIALIZING_WASM',
    PARSING : 'PARSING',
    PROCESSING_WORKER_LOOP : 'PROCESSING_WORKER_LOOP',
    SUCCESS : 'SUCCESS',
    FAILED : 'FAILED',
    CANCELLED : 'CANCELLED'
};

export const ImportEvent =
{
    START : 'START',
    SCRIPT_LOADED : 'SCRIPT_LOADED',
    WASM_INITIALIZED : 'WASM_INITIALIZED',
    PARSE_COMPLETE : 'PARSE_COMPLETE',
    WORKER_ITEM_COMPLETE : 'WORKER_ITEM_COMPLETE',
    WORKER_LOOP_COMPLETE : 'WORKER_LOOP_COMPLETE',
    LOAD_FAILED : 'LOAD_FAILED',
    INIT_FAILED : 'INIT_FAILED',
    PARSE_FAILED : 'PARSE_FAILED',
    WORKER_ERROR : 'WORKER_ERROR',
    CANCEL : 'CANCEL',
    CLEAR_COMPLETE : 'CLEAR_COMPLETE'
};

export class ImportErrorData
{
    constructor (code, message = null)
    {
        this.code = code;
        this.message = message;
        this.details = {
            stateAtFailure : null,
            generation : null,
            cause : null,
            timestamp : Date.now ()
        };
    }
}

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
        this.errorData = null;

        this.state = ImportState.IDLE;
        this.importGeneration = 0;

        this.worker = null;
        this.workerMessageHandler = null;
        this.workerErrorHandler = null;
        this.wasmInstance = null;
    }

    Import (name, extension, content, callbacks)
    {
        this.importGeneration += 1;
        const currentGeneration = this.importGeneration;

        this.Clear ();

        this.name = name;
        this.extension = extension;
        this.callbacks = callbacks;
        this.model = new Model ();
        this.error = false;
        this.message = null;
        this.errorData = null;

        this.ResetContent ();

        const protectedOnFinish = () => {
            if (!this.IsCurrentGeneration (currentGeneration)) {
                return;
            }
            this.CreateResult (callbacks, currentGeneration);
        };

        this.ImportContent (content, currentGeneration, protectedOnFinish);
    }

    Clear ()
    {
        this.importGeneration += 1;

        this.name = null;
        this.extension = null;
        this.callbacks = null;
        this.model = null;
        this.error = null;
        this.message = null;
        this.errorData = null;
        this.state = ImportState.IDLE;

        this.ClearContent ();
    }

    Cancel ()
    {
        if (this.IsActiveState (this.state)) {
            this.HandleEvent (ImportEvent.CANCEL, {
                generation : this.importGeneration
            });
        }
    }

    CreateResult (callbacks, generation)
    {
        if (!this.IsCurrentGeneration (generation)) {
            return;
        }

        if (this.state === ImportState.CANCELLED) {
            if (callbacks.onCancel) {
                callbacks.onCancel ();
            }
            if (callbacks.onComplete) {
                callbacks.onComplete ();
            }
            return;
        }

        if (this.state === ImportState.FAILED || this.error) {
            if (callbacks.onError) {
                callbacks.onError ();
            }
            if (callbacks.onComplete) {
                callbacks.onComplete ();
            }
            return;
        }

        if (IsModelEmpty (this.model)) {
            this.SetError (Loc ('The model doesn\'t contain any meshes.'));
            if (callbacks.onError) {
                callbacks.onError ();
            }
            if (callbacks.onComplete) {
                callbacks.onComplete ();
            }
            return;
        }

        FinalizeModel (this.model, {
            defaultLineMaterialColor : this.callbacks.getDefaultLineMaterialColor (),
            defaultMaterialColor : this.callbacks.getDefaultMaterialColor ()
        });

        if (callbacks.onSuccess) {
            callbacks.onSuccess ();
        }
        if (callbacks.onComplete) {
            callbacks.onComplete ();
        }
    }

    HandleEvent (event, eventData = null)
    {
        if (eventData && eventData.generation !== undefined) {
            if (!this.IsCurrentGeneration (eventData.generation)) {
                return;
            }
        }

        if (event === ImportEvent.CANCEL) {
            if (this.IsActiveState (this.state)) {
                this.BeforeTransition (this.state, ImportState.CANCELLED);
                this.state = ImportState.CANCELLED;
                this.AfterTransition (null, ImportState.CANCELLED, eventData);
            }
            return;
        }

        const transition = this.FindTransition (this.state, event);
        if (!transition) {
            console.warn (`Unexpected event ${event} in state ${this.state}`);
            return;
        }

        this.BeforeTransition (this.state, transition.targetState);
        const previousState = this.state;
        this.state = transition.targetState;
        this.AfterTransition (previousState, transition.targetState, eventData);
    }

    FindTransition (fromState, event)
    {
        const transitions = {
            [ImportState.IDLE] : {
                [ImportEvent.START] : { targetState : ImportState.LOADING_SCRIPT }
            },
            [ImportState.LOADING_SCRIPT] : {
                [ImportEvent.SCRIPT_LOADED] : { targetState : ImportState.INITIALIZING_WASM },
                [ImportEvent.LOAD_FAILED] : { targetState : ImportState.FAILED }
            },
            [ImportState.INITIALIZING_WASM] : {
                [ImportEvent.WASM_INITIALIZED] : { targetState : ImportState.PARSING },
                [ImportEvent.INIT_FAILED] : { targetState : ImportState.FAILED }
            },
            [ImportState.PARSING] : {
                [ImportEvent.PARSE_COMPLETE] : { targetState : ImportState.SUCCESS },
                [ImportEvent.PARSE_FAILED] : { targetState : ImportState.FAILED }
            },
            [ImportState.PROCESSING_WORKER_LOOP] : {
                [ImportEvent.WORKER_ITEM_COMPLETE] : { targetState : ImportState.PROCESSING_WORKER_LOOP },
                [ImportEvent.WORKER_LOOP_COMPLETE] : { targetState : ImportState.SUCCESS },
                [ImportEvent.WORKER_ERROR] : { targetState : ImportState.FAILED }
            }
        };

        const stateTransitions = transitions[fromState];
        if (!stateTransitions) {
            return null;
        }
        return stateTransitions[event] || null;
    }

    BeforeTransition (fromState, toState)
    {
        if (!this.IsActiveState (fromState)) {
            return;
        }

        if (this.worker !== null) {
            if (this.workerMessageHandler) {
                this.worker.removeEventListener ('message', this.workerMessageHandler);
                this.worker.removeEventListener ('error', this.workerErrorHandler);
            }
            this.worker.terminate ();
            this.worker = null;
            this.workerMessageHandler = null;
            this.workerErrorHandler = null;
        }
    }

    AfterTransition (fromState, toState, eventData)
    {
        if (this.IsTerminalState (toState)) {
            if (this.callbacks) {
                switch (toState) {
                    case ImportState.SUCCESS:
                        if (this.callbacks.onSuccess) {
                            this.callbacks.onSuccess ();
                        }
                        break;
                    case ImportState.FAILED:
                        this.error = true;
                        if (this.callbacks.onError) {
                            this.callbacks.onError ();
                        }
                        break;
                    case ImportState.CANCELLED:
                        if (this.callbacks.onCancel) {
                            this.callbacks.onCancel ();
                        }
                        break;
                }
                if (this.callbacks.onComplete) {
                    this.callbacks.onComplete ();
                }
            }
            this.Clear ();
        }
    }

    IsActiveState (state)
    {
        return state === ImportState.LOADING_SCRIPT ||
               state === ImportState.INITIALIZING_WASM ||
               state === ImportState.PARSING ||
               state === ImportState.PROCESSING_WORKER_LOOP;
    }

    IsTerminalState (state)
    {
        return state === ImportState.SUCCESS ||
               state === ImportState.FAILED ||
               state === ImportState.CANCELLED;
    }

    IsCurrentGeneration (checkGeneration)
    {
        return this.importGeneration === checkGeneration;
    }

    WrapCallback (callback, generation)
    {
        if (!callback) {
            return null;
        }
        return (...args) => {
            if (!this.IsCurrentGeneration (generation)) {
                return;
            }
            return callback (...args);
        };
    }

    SetErrorData (errorData)
    {
        this.errorData = errorData;
        this.error = true;
        if (errorData.message) {
            this.message = errorData.message;
        }
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

    ImportContent (fileContent, generation, onFinish)
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
            this.message = message;
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

    GetErrorData ()
    {
        return this.errorData;
    }
}
```

### 8.2 回调接口扩展

```javascript
// 扩展的回调接口（建议）
export class ImportCallbacks
{
    constructor ()
    {
        // 原有的回调
        this.onSuccess = null;
        this.onError = null;
        this.onComplete = null;

        // 新增：取消回调
        this.onCancel = null;

        // 原有：获取默认颜色
        this.getDefaultLineMaterialColor = null;
        this.getDefaultMaterialColor = null;
        this.getFileBuffer = null;
    }
}
```

---

## 9. 验证检查清单

### 9.1 代码重构验证项

| 检查项 | 验证方法 | 预期结果 |
|--------|---------|---------|
| **Promise 链完整** | 检查所有 `.then()` 是否有对应的 `.catch()` 或正确 return | 所有异步错误都能被捕获 |
| **世代校验** | 检查所有异步回调入口是否调用 `IsCurrentGeneration()` | 过期回调被静默忽略 |
| **状态机覆盖** | 检查所有状态迁移是否在规则表中定义 | 无未定义的状态转换 |
| **Worker 清理** | 检查 `ClearContent()` 是否调用 `removeEventListener` | 无内存泄漏的事件监听器 |
| **错误码映射** | 检查四类失败是否使用正确的细分错误码 | 错误码与场景对应 |
| **回调契约** | 检查所有路径是否最终触发 `onComplete` | 无悬挂的导入操作 |

### 9.2 测试场景

#### 场景 1: 脚本加载失败

```
测试步骤：
1. 模拟网络错误（断开网络或使用无效 URL）
2. 尝试导入 .3dm 文件

预期行为：
- 状态：IDLE → LOADING_SCRIPT → FAILED → IDLE
- 回调：onError → onComplete
- 资源：无泄漏，worker 被 terminate
- 世代：generation 递增，可重试
```

#### 场景 2: WASM 初始化失败

```
测试步骤：
1. 模拟 WASM 编译错误（使用不兼容的浏览器或损坏的 WASM）
2. 尝试导入 .ifc 文件

预期行为：
- 状态：IDLE → LOADING_SCRIPT → INITIALIZING_WASM → FAILED → IDLE
- 回调：onError → onComplete
- 错误码：WasmInitFailed (102)
- 无悬挂
```

#### 场景 3: Worker 运行时异常

```
测试步骤：
1. 使用会导致崩溃的 BRep 文件
2. 尝试导入 .step 或 .fcstd 文件

预期行为：
- 状态：IDLE → ... → PROCESSING_WORKER_LOOP → FAILED → IDLE
- 回调：onError → onComplete
- 资源：worker.terminate() 被调用
- 无消息监听器泄漏
```

#### 场景 4: 重叠导入竞态

```
测试步骤：
1. 开始导入大文件 A（需要 WASM 加载）
2. 在 WASM 加载过程中，开始导入文件 B（纯 JS 格式如 .stl）
3. 等待文件 B 完成
4. 等待文件 A 的 WASM 加载完成

预期行为：
- 文件 B 正常完成并显示
- 文件 A 的过期回调被静默忽略
- 无状态污染
- 最终状态：IDLE（文件 B 已完成）
```

#### 场景 5: 显式取消

```
测试步骤：
1. 开始导入大文件
2. 在导入过程中调用 importer.Cancel()

预期行为（如果已实现 Cancel API）：
- 状态：当前活跃态 → CANCELLED → IDLE
- 回调：onCancel → onComplete
- 资源：worker.terminate() 被调用
- 无悬挂
```

---

## 10. 总结

### 10.1 核心改进点

| 问题 | 解决方案 | 实施位置 |
|------|---------|---------|
| Promise 链断裂 | 正确 return 内部 Promise + 统一 `.catch()` | 所有 `ImportContent` 方法 |
| 无状态管理 | 显式状态枚举 + 状态机 | `ImporterBase` |
| 旧回调污染 | 世代计数器 + `IsCurrentGeneration()` 校验 | `ImporterBase` + 所有异步入口 |
| Worker 资源泄漏 | `removeEventListener` + `terminate()` | `BeforeTransition()` 钩子 |
| 错误信息不明确 | 细分错误码 + `ImportErrorData` | 错误处理逻辑 |
| 无取消机制 | `Cancel()` API + `CANCELLED` 状态 | `ImporterBase` |

### 10.2 状态收敛准则的核心保证

```
┌─────────────────────────────────────────────────────────────────┐
│                    统一状态收敛准则的核心保证                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 任何导入操作，无论成功/失败/取消，最终都必须到达 IDLE 状态   │
│     └── 通过强制状态迁移规则 + onComplete 回调保证              │
│                                                                 │
│  2. 任何异步回调，在执行前必须校验世代                           │
│     └── 通过 WrapCallback() + IsCurrentGeneration() 保证       │
│                                                                 │
│  3. 离开任何活跃态时，必须清理已分配的资源                       │
│     └── 通过 BeforeTransition() 钩子 + ClearContent() 保证     │
│                                                                 │
│  4. 任何错误必须有明确的错误码和上下文                           │
│     └── 通过 ImportErrorData + 细分错误码保证                  │
│                                                                 │
│  5. 用户必须有能力主动取消操作                                   │
│     └── 通过 Cancel() API + CANCELLED 状态保证                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 附录: 文件修改索引

| 文件 | 修改内容 | 重要程度 |
|------|---------|---------|
| `source/engine/import/importerbase.js` | 添加状态机、世代计数器、事件处理 | 🔴 关键 |
| `source/engine/import/importer3dm.js` | Promise 链修复 + 世代保护 | 🔴 关键 |
| `source/engine/import/importerifc.js` | Promise 链修复 + 世代保护 | 🔴 关键 |
| `source/engine/import/importerocct.js` | Worker 事件清理 + 世代保护 | 🔴 关键 |
| `source/engine/import/importerfcstd.js` | Worker 循环错误处理 + 世代保护 | 🔴 关键 |
| `source/engine/import/importergltf.js` | Draco 加载 Promise 修复 | 🟡 重要 |
| `source/engine/import/importerutils.js` | `DisposeOcctWorkerCache()` 新增 | 🟢 可选 |
| `source/engine/import/importer.js` | 错误码扩展 + `ImportErrorData` | 🟡 重要 |
