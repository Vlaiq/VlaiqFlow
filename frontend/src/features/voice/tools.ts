import { z } from 'zod';
import {
  ContextInput,
  PreferenceInput,
  CompareInput,
  SelectInput,
  type Comparison,
  type JourneyContext,
  type JourneySelected,
  type PreferencesUpdated,
  type ErrorCode,
  type Place,
  type ToolEnvelope,
} from '../../../../shared/src/flowVoice';

export class FlowError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public candidates?: Place[],
  ) {
    super(message);
  }
}
export interface JourneyToolAdapter<Plan = unknown> {
  revision(): string;
  context(): JourneyContext;
  update(input: z.infer<typeof PreferenceInput>): PreferencesUpdated;
  calculate(input: z.infer<typeof CompareInput>, signal: AbortSignal): Promise<Plan>;
  commit(plan: Plan): Comparison;
  select(input: z.infer<typeof SelectInput>, signal: AbortSignal): Promise<JourneySelected>;
}
export const TOOL_BUDGET = {
  get_journey_context: 3500,
  update_journey_preferences: 3500,
  compare_journeys: 11500,
  select_and_explain_journey: 5500,
} as const;
export type ToolName = keyof typeof TOOL_BUDGET;
/** Owns session lifetime, cancellation and commit guards; never stores GPS or transcript data. */
export class JourneyTools<Plan = unknown> {
  private session = 0;
  private active = false;
  private mutation = 0;
  private requests = new Map<string, Promise<string>>();
  private controllers = new Set<AbortController>();
  constructor(private adapter: JourneyToolAdapter<Plan>) {}
  begin() {
    this.end();
    this.active = true;
  }
  end() {
    this.active = false;
    this.session++;
    this.mutation++;
    for (const ctrl of this.controllers) ctrl.abort();
    this.controllers.clear();
    this.requests.clear();
  }
  handlers() {
    const session = this.session;
    return Object.fromEntries(
      (Object.keys(TOOL_BUDGET) as ToolName[]).map((name) => [
        name,
        (input: Record<string, unknown>) =>
          this.active && this.session === session
            ? this.call(name, input)
            : Promise.resolve(
                JSON.stringify({
                  ok: false,
                  error: {
                    code: 'STALE_CONTEXT',
                    message: 'Sesiunea comenzii nu mai este activă.',
                  },
                }),
              ),
      ]),
    );
  }
  call(name: ToolName, input: unknown): Promise<string> {
    const key = `${name}:${JSON.stringify(input)}:${this.adapter.revision()}`;
    const pending = this.requests.get(key);
    if (pending) return pending;
    const operation = this.execute(name, input).finally(() => this.requests.delete(key));
    this.requests.set(key, operation);
    return operation;
  }
  private async execute(name: ToolName, raw: unknown): Promise<string> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ctrl = new AbortController();
    this.controllers.add(ctrl);
    const session = this.session;
    let mutation = this.mutation;
    const revision = this.adapter.revision();
    const valid = () => {
      if (
        !this.active ||
        this.session !== session ||
        ctrl.signal.aborted ||
        this.mutation !== mutation ||
        this.adapter.revision() !== revision
      )
        throw new FlowError('STALE_CONTEXT', 'Contextul s-a schimbat. Citește din nou călătoria.');
    };
    try {
      const schema = {
        get_journey_context: ContextInput,
        update_journey_preferences: PreferenceInput,
        compare_journeys: CompareInput,
        select_and_explain_journey: SelectInput,
      }[name];
      const parsed = schema.safeParse(raw);
      if (!parsed.success)
        throw new FlowError('INVALID_INPUT', 'Parametrii comenzii sunt invalizi.');
      valid();
      if (name !== 'get_journey_context') {
        mutation = ++this.mutation;
        for (const previous of this.controllers) if (previous !== ctrl) previous.abort();
      }
      const result = await Promise.race([
        (async (): Promise<unknown> => {
          if (name === 'get_journey_context') return this.adapter.context();
          if (name === 'update_journey_preferences')
            return this.adapter.update(PreferenceInput.parse(raw));
          if (name === 'compare_journeys') {
            const plan = await this.adapter.calculate(CompareInput.parse(raw), ctrl.signal);
            valid(); // No location/result state changes are permitted before this check.
            return this.adapter.commit(plan);
          }
          if (this.adapter.context().navigation.active)
            throw new FlowError(
              'NAVIGATION_ACTIVE',
              'Oprește navigația sau confirmă schimbarea în navigator.',
            );
          return this.adapter.select(SelectInput.parse(raw), ctrl.signal);
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new FlowError('TIMEOUT', 'Operația a durat prea mult. Reîncearcă.'));
            ctrl.abort();
          }, TOOL_BUDGET[name]);
          ctrl.signal.addEventListener(
            'abort',
            () =>
              reject(new FlowError('STALE_CONTEXT', 'Sesiunea sau cererea nu mai este activă.')),
            { once: true },
          );
        }),
      ]);
      if (!this.active || this.session !== session || ctrl.signal.aborted)
        throw new FlowError('STALE_CONTEXT', 'Sesiunea nu mai este activă.');
      return JSON.stringify({ ok: true, data: result } satisfies ToolEnvelope<unknown>);
    } catch (error) {
      const e =
        error instanceof FlowError
          ? error
          : new FlowError('SERVICE_UNAVAILABLE', 'Serviciul nu este disponibil acum.');
      return JSON.stringify({
        ok: false,
        error: {
          code: e.code,
          message: e.message,
          ...(e.candidates ? { candidates: e.candidates } : {}),
        },
      } satisfies ToolEnvelope<never>);
    } finally {
      clearTimeout(timer);
      this.controllers.delete(ctrl);
    }
  }
}
