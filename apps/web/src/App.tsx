import { useEffect, useState, type CSSProperties } from 'react';
import { ArrowUpRight, Check, ChevronDown, CircleStop, FlaskConical, Headphones, Mic, MicOff, Play, Settings2, SlidersHorizontal, Sparkles, VolumeX, X } from 'lucide-react';
import { defaultConfig, models, voices, requiresRestart, sessionConfigSchema, type SessionConfig, type SessionMode, type SessionStatus } from '@sona/shared';
import { useVoiceSession } from './session/useVoiceSession';
import { copy, type Locale } from './i18n';

function Character({ status, level, label }: { status: SessionStatus; level: number; label: string }) {
  const mouth = status === 'speaking' ? 8 + Math.min(1, level) * 34 : 3;
  return <div className={`character-wrap ${status}`}>
    <div className="orbit orbit-one" /><div className="orbit orbit-two" />
    <svg className="character" viewBox="0 0 320 300" role="img" aria-label={label}>
      <defs>
        <radialGradient id="body" cx="34%" cy="22%" r="83%"><stop offset="0" stopColor="#bad7ff"/><stop offset=".5" stopColor="#649aff"/><stop offset="1" stopColor="#2454d3"/></radialGradient>
        <radialGradient id="cheek"><stop stopColor="#e9deff" stopOpacity=".65"/><stop offset="1" stopColor="#e9deff" stopOpacity="0"/></radialGradient>
        <radialGradient id="shadow"><stop stopColor="#23459b" stopOpacity=".2"/><stop offset="1" stopColor="#23459b" stopOpacity="0"/></radialGradient>
      </defs>
      <ellipse cx="160" cy="270" rx="114" ry="16" fill="url(#shadow)"/>
      <g className="creature">
        <path d="M62 137 C36 65 47 34 86 53 L116 72 Q160 58 205 73 L237 51 C274 35 282 77 260 137 C284 206 235 252 160 252 C83 252 36 207 62 137Z" fill="url(#body)"/>
        <path d="M69 104 Q54 56 82 67 L106 85Z" fill="#477cdc" opacity=".5"/>
        <path d="M216 85 L239 66 Q266 52 252 104Z" fill="#315cc6" opacity=".4"/>
        <ellipse cx="91" cy="184" rx="29" ry="21" fill="url(#cheek)"/><ellipse cx="229" cy="184" rx="29" ry="21" fill="url(#cheek)"/>
        <g className="eyes" fill="#11234a"><ellipse cx="113" cy="151" rx="9" ry="15"/><ellipse cx="207" cy="151" rx="9" ry="15"/></g>
        <g fill="#fff" opacity=".85"><circle cx="110" cy="146" r="3"/><circle cx="204" cy="146" r="3"/></g>
        <path className="brows" d="M100 119 Q112 115 122 120 M198 120 Q208 115 221 120" fill="none" stroke="#2856af" strokeWidth="4" strokeLinecap="round"/>
        <ellipse className="mouth" cx="160" cy="190" rx={status === 'speaking' ? 14 + level * 5 : 15} ry={mouth / 2} fill="#162449" />
        {status === 'speaking' && <ellipse cx="160" cy={193 + mouth / 5} rx="8" ry={mouth / 7} fill="#e493a8"/>}
        <path d="M91 96 Q138 69 177 82" stroke="white" opacity=".2" strokeWidth="6" strokeLinecap="round" fill="none"/>
      </g>
    </svg>
  </div>;
}

export default function App() {
  const [locale, setLocale] = useState<Locale>('en');
  const [mode, setMode] = useState<SessionMode>('simulation');
  const [draft, setDraft] = useState<SessionConfig>({ ...defaultConfig });
  const [apiKey, setApiKey] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [advanced, setAdvanced] = useState(false);
  const [conversationOpen, setConversationOpen] = useState(false);
  const { snapshot, start, stop, setMuted, interrupt, apply, simulateTurn, simulateFailure } = useVoiceSession();
  const t = copy[locale];
  const active = !['idle', 'error'].includes(snapshot.status);
  const connected = active && snapshot.status !== 'connecting';
  const valid = sessionConfigSchema.safeParse(draft).success;
  const dirty = snapshot.appliedConfig !== null && JSON.stringify(draft) !== JSON.stringify(snapshot.appliedConfig);
  const restart = connected && snapshot.appliedConfig !== null && requiresRestart(snapshot.appliedConfig, draft);
  const update = <K extends keyof SessionConfig>(key: K, value: SessionConfig[K]) => setDraft((old) => ({ ...old, [key]: value }));
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  const begin = () => { const key = apiKey; setApiKey(''); void start(mode, draft, key); };
  const statusTitle = { idle:t.welcome, connecting:t.connecting, listening:t.listening, thinking:t.thinking, speaking:t.speaking, error:t.errorTitle }[snapshot.status];
  return <div className={`app ${settingsOpen ? 'with-settings' : ''}`}>
    <header className="topbar">
      <a className="brand" href="https://github.com/studio-glhf/Sona" target="_blank" rel="noreferrer" aria-label={t.source}><span className="brand-icon"><Headphones size={20}/></span><span>Sona<span className="brand-period">.</span></span></a>
      <span className="lab-label">{t.lab}</span>
      <div className="header-actions"><div className="language-switch" role="group" aria-label={t.languageSwitch}>{(['en','ko'] as const).map((value) => <button key={value} aria-pressed={locale===value} onClick={() => setLocale(value)}>{value === 'en' ? 'EN' : '한국어'}</button>)}</div><span className="header-divider"/><button className={`icon-button ${settingsOpen?'selected':''}`} onClick={() => setSettingsOpen(!settingsOpen)} aria-expanded={settingsOpen} aria-controls="agent-settings" aria-label={settingsOpen?t.hideSettings:t.showSettings}><SlidersHorizontal size={19}/></button></div>
    </header>
    <main className="workspace">
      <div className="workspace-heading"><div><div className="eyebrow">{t.prototype}</div><h1>{t.playground}</h1></div><span className={`status-pill ${snapshot.status}`} role="status"><i/>{t.statuses[snapshot.status]}</span></div>
      <div className="stage">
        <div className="mode-switch" role="group" aria-label={t.mode} title={active?t.modeLocked:undefined}>
          <button disabled={active} aria-pressed={mode==='simulation'} onClick={() => {setMode('simulation');setApiKey('');}}><FlaskConical size={15}/>{t.simulation}</button>
          <button disabled={active} aria-pressed={mode==='live'} onClick={() => setMode('live')}><span className="live-symbol"/>{t.live}</button>
        </div>
        <p className="mode-note">{mode==='simulation'?t.noCredits:t.liveCredits}</p>
        <Character status={snapshot.status} level={snapshot.level} label={t.agentIllustration}/>
        <div className="stage-copy"><h2>{statusTitle}</h2><p>{snapshot.muted?t.microphoneMuted:mode==='simulation'?(connected?t.simulationActiveHint:t.simulationHint):active?t.liveHint:t.idleHint}</p></div>
        {snapshot.error && <div className="error-banner" role="alert">{t.errors[snapshot.error]}</div>}
        {mode === 'live' && !active && <div className="key-entry"><label htmlFor="api-key">{t.apiKey}</label><input id="api-key" type="password" autoComplete="off" spellCheck={false} value={apiKey} onChange={(e)=>setApiKey(e.target.value)} placeholder={t.apiKeyPlaceholder}/><p>{t.keyHint} {t.billingHint}</p></div>}
        <div className="session-controls">
          {connected && <button className="round-button" aria-label={snapshot.muted?t.unmute:t.mute} aria-pressed={snapshot.muted} disabled={mode==='simulation'} title={mode==='simulation'?t.simulationMic:undefined} onClick={()=>setMuted(!snapshot.muted)}>{snapshot.muted?<MicOff size={20}/>:<Mic size={20}/>}</button>}
          <button className={`session-button ${active?'end':''}`} disabled={!active&&(!valid||(mode==='live'&&apiKey.trim().length<10))} onClick={active?stop:begin}>{active?<CircleStop size={19}/>:<Play size={18} fill="currentColor"/>}{snapshot.status==='connecting'?t.connect:active?t.end:t.start}</button>
          {connected && <button className="round-button" aria-label={t.interrupt} disabled={!['speaking','thinking'].includes(snapshot.status)} onClick={interrupt}><VolumeX size={20}/></button>}
        </div>
        {mode==='simulation'&&connected&&<div className="simulation-actions"><button className="text-button" onClick={simulateTurn} disabled={snapshot.status!=='listening'}><Sparkles size={15}/>{t.simulate}</button><button className="quiet-button" onClick={simulateFailure}>{t.simulateFail}</button></div>}
        <div className="stage-footnote"><span className="mini-wave">{[.4,.7,1,.6,.3].map((h,i)=><i key={i} style={{'--bar': h, transform:`scaleY(${snapshot.status==='speaking'?Math.max(.2,snapshot.level*(i+1)):h})`} as CSSProperties}/>)}</span>{mode==='simulation'?t.simulatedAnimation:t.audioReactive}</div>
      </div>
      <section className={`conversation-panel ${conversationOpen?'expanded':''}`}>
        <button className="conversation-toggle" aria-expanded={conversationOpen} aria-controls="transcript" onClick={()=>setConversationOpen(!conversationOpen)}><span><span className="conversation-icon">≋</span>{t.conversation}<span className="count">{snapshot.transcript.length}</span></span><span className="conversation-meta">{t.ephemeral}<ChevronDown size={17}/></span></button>
        {conversationOpen&&<div id="transcript" className="transcript"><span className="transcript-tag">{mode==='simulation'?t.synthetic:t.liveTranscript}</span>{snapshot.transcript.length===0?<div className="empty-transcript"><p>{t.emptyTranscript}</p><small>{t.emptyTranscriptHint}</small></div>:snapshot.transcript.map(item=><article key={item.id} className={`utterance ${item.role}`}><span>{item.role==='user'?t.researcher:t.agent}</span><p>{item.text}</p></article>)}</div>}
      </section>
      <footer className="workspace-footer"><span>{t.version}</span><a href="https://github.com/studio-glhf/Sona" target="_blank" rel="noreferrer">{t.source}<ArrowUpRight size={14}/></a></footer>
    </main>
    {settingsOpen&&<aside id="agent-settings" className="settings-panel" aria-label={t.settings}>
      <div className="settings-title"><div><Settings2 size={18}/><h2>{t.settings}</h2></div><button className="icon-button close-settings" aria-label={t.hideSettings} onClick={()=>setSettingsOpen(false)}><X size={17}/></button></div>
      <p className="settings-subtitle">{t.settingsSubtitle}</p>
      <div className="setting-tabs" role="group" aria-label={t.settingsTabs}><button aria-pressed={!advanced} onClick={()=>setAdvanced(false)}>{t.common}</button><button aria-pressed={advanced} onClick={()=>setAdvanced(true)}>{t.advanced}</button></div>
      <div className="settings-fields">
        {!advanced?<>
          <label className="field"><span>{t.model}<small className="restart-label">{t.restartBadge}</small></span><select value={draft.model} onChange={(e)=>update('model',e.target.value as SessionConfig['model'])}>{models.map(v=><option key={v}>{v}</option>)}</select></label>
          <div className="field-row"><label className="field"><span>{t.voice}<small className="restart-label">{t.restartBadge}</small></span><select value={draft.voice} onChange={(e)=>update('voice',e.target.value as SessionConfig['voice'])}>{voices.map(v=><option key={v} value={v}>{v.charAt(0).toUpperCase()+v.slice(1)}</option>)}</select></label><label className="field"><span>{t.responseLanguage}</span><select value={draft.language} onChange={(e)=>update('language',e.target.value as Locale)}><option value="en">{t.english}</option><option value="ko">{t.korean}</option></select></label></div>
          <p className="field-hint">{t.restartHint}</p>
          <label className="field instructions-field"><span>{t.instructions}<span className="character-count">{draft.instructions.length.toLocaleString()}</span></span><textarea rows={7} value={draft.instructions} maxLength={12000} onChange={(e)=>update('instructions',e.target.value)}/><small>{t.instructionsHint}</small></label>
        </>:<>
          <label className="field"><span>{t.turnDetection}</span><select value={draft.turnDetection} onChange={(e)=>update('turnDetection',e.target.value as SessionConfig['turnDetection'])}><option value="semantic_vad">{t.semanticVad}</option><option value="server_vad">{t.serverVad}</option></select><small>{t.turnHint}</small></label>
          {draft.turnDetection==='semantic_vad'?<label className="field"><span>{t.eagerness}</span><select value={draft.eagerness} onChange={(e)=>update('eagerness',e.target.value as SessionConfig['eagerness'])}>{(['auto','low','medium','high'] as const).map(v=><option key={v} value={v}>{t[v]}</option>)}</select><small>{t.eagernessHint}</small></label>:<>
            <label className="field range-field"><span>{t.threshold}<output>{draft.threshold.toFixed(2)}</output></span><input type="range" min="0" max="1" step=".05" value={draft.threshold} onChange={(e)=>update('threshold',Number(e.target.value))}/><small>{t.thresholdHint}</small></label>
            <label className="field range-field"><span>{t.silence}<output>{draft.silenceDurationMs} {t.ms}</output></span><input type="range" min="200" max="2000" step="100" value={draft.silenceDurationMs} onChange={(e)=>update('silenceDurationMs',Number(e.target.value))}/><small>{t.silenceHint}</small></label>
          </>}
          <p className="advanced-note">{locale==='ko'?'현재 프로토타입은 핵심 설정을 지원해요. 전체 매개변수와 도구 설정은 로드맵에 있어요.':'This prototype supports the core settings. Complete parameter coverage and tool controls are on the roadmap.'}</p>
        </>}
      </div>
      <div className="apply-area"><div className={`apply-status ${dirty?'dirty':''}`} aria-live="polite">{snapshot.applying?<><span className="spinner"/>{t.pending}</>:dirty?<><span className="small-dot"/>{t.unsaved}</>:<><Check size={14}/>{connected?t.applied:t.ready}</>}</div>{!valid&&<p className="field-error">{t.invalid}</p>}{restart&&<p className="restart-notice">{t.restartNeeded}</p>}<button className="apply-button" onClick={()=>{void apply(draft).catch(()=>{});}} disabled={!connected||!dirty||!valid||restart||snapshot.applying}>{snapshot.applying?t.applying:t.apply}<Check size={16}/></button><p className="field-hint">{connected?t.appliedHint:locale==='ko'?'세션을 시작할 때 설정이 적용돼요.':'Settings apply when you start a session.'}</p></div>
      <div className="connections"><h3>{t.tools}<span>{t.planned}</span></h3><p>{t.toolsHint}</p>{[[t.google,'G'],[t.github,'⌘'],[t.notion,'N']].map(([label,icon])=><div className="connection-row" key={label}><span className="service-icon">{icon}</span><span>{label}</span><span className="connection-status">{t.planned}</span></div>)}<a href="https://github.com/studio-glhf/Sona/issues?q=is%3Aissue+label%3Aarea%3Aintegrations" target="_blank" rel="noreferrer">{t.roadmap}<ArrowUpRight size={14}/></a></div>
    </aside>}
  </div>;
}
