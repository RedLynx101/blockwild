/** Asynchronous WebGL2 timer queries. Results are polled without stalling. */
type DisjointTimerExtension = Readonly<{
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}>;

export class WebGlGpuTimer {
  private readonly gl: WebGL2RenderingContext | null;
  private readonly extension: DisjointTimerExtension | null;
  private readonly pending: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;

  constructor(context: WebGLRenderingContext | WebGL2RenderingContext) {
    const webgl2 = typeof WebGL2RenderingContext !== "undefined" && context instanceof WebGL2RenderingContext
      ? context
      : null;
    this.gl = webgl2;
    this.extension = webgl2?.getExtension("EXT_disjoint_timer_query_webgl2") as DisjointTimerExtension | null;
  }

  get supported() { return Boolean(this.gl && this.extension); }

  begin() {
    if (!this.gl || !this.extension || this.active || this.pending.length >= 4) return false;
    const query = this.gl.createQuery();
    if (!query) return false;
    this.gl.beginQuery(this.extension.TIME_ELAPSED_EXT, query);
    this.active = query;
    return true;
  }

  end() {
    if (!this.gl || !this.extension || !this.active) return;
    this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
  }

  /** Returns the newest completed result; pending work remains asynchronous. */
  poll() {
    if (!this.gl || !this.extension) return undefined;
    const disjoint = Boolean(this.gl.getParameter(this.extension.GPU_DISJOINT_EXT));
    let latestMilliseconds: number | undefined;
    while (this.pending.length) {
      const query = this.pending[0];
      if (!this.gl.getQueryParameter(query, this.gl.QUERY_RESULT_AVAILABLE)) break;
      this.pending.shift();
      if (!disjoint) {
        const nanoseconds = Number(this.gl.getQueryParameter(query, this.gl.QUERY_RESULT));
        if (Number.isFinite(nanoseconds)) latestMilliseconds = Math.max(0, nanoseconds / 1_000_000);
      }
      this.gl.deleteQuery(query);
    }
    return latestMilliseconds;
  }

  dispose() {
    if (!this.gl) return;
    if (this.active) this.gl.deleteQuery(this.active);
    for (const query of this.pending) this.gl.deleteQuery(query);
    this.active = null;
    this.pending.length = 0;
  }
}
