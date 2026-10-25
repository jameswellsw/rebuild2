import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  PRESET_BOTS,
  REBUILT_FIELD,
  formatTime,
  type Alliance,
  type MatchMode,
  type RoomSlot,
} from '@rebuilt/shared';
import { useRoom } from '../lib/useRoom';
import { useProfile } from '../lib/profile';
import { useToast } from '../lib/toast';
import { useFields } from '../lib/useFields';
import { BotAvatar } from '../components/BotAvatar';
import { Icon } from '../components/Icon';
import { Logo } from '../components/Logo';
import { MatchArena } from '../components/match/MatchArena';

const MODE_COUNTS: Record<MatchMode, number> = { '1v1': 1, '2v2': 2, '3v3': 3 };

function slotIsActive(mode: MatchMode, slot: RoomSlot): boolean {
  return slot.position < MODE_COUNTS[mode];
}

export function RoomPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { push } = useToast();
  const connection = useRoom(code);
  const { fields } = useFields();
  const {
    room,
    bots,
    self,
    isHost,
    isReferee,
    connected,
    reconnecting,
    error,
    setup,
    snapshot,
    results,
    chat,
    claimSlot,
    selectBot,
    addAI,
    removeAI,
    setReady,
    startMatch,
    returnToLobby,
    setRole,
    leaveSlot,
    sendRef,
    sendChat,
    sendInput,
    sendHumanInput,
    updateSettings,
  } = connection;
  const [chatText, setChatText] = useState('');
  const [copied, setCopied] = useState(false);
  const chatBody = useRef<HTMLDivElement>(null);
  const inviteUrl = useMemo(
    () => `${window.location.origin}/room/${code?.toUpperCase() ?? ''}`,
    [code],
  );
  const canManage = Boolean(isHost || self?.role === 'referee');
  const availableBots = bots.length ? bots : PRESET_BOTS;

  useEffect(() => {
    if (room) document.title = `${room.name} · REBUILT Arena`;
    return () => {
      document.title = 'REBUILT Arena — FRC 2026 Simulator';
    };
  }, [room]);

  useEffect(() => {
    if (chatBody.current) {
      chatBody.current.scrollTop = chatBody.current.scrollHeight;
    }
  }, [chat.length]);

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      push('Invite link copied. Send it to your drive team.', 'success');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      push(`Invite link: ${inviteUrl}`, 'info', 10000);
    }
  };

  const shareInvite = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join ${room?.name ?? 'my REBUILT room'}`,
          text: `Room code ${code?.toUpperCase()} — jump into REBUILT Arena.`,
          url: inviteUrl,
        });
        return;
      } catch {
        // Falling back to copy is fine.
      }
    }
    void copyInvite();
  };

  const submitChat = () => {
    const text = chatText.trim();
    if (!text) return;
    sendChat(text);
    setChatText('');
  };

  if (!connected && !room) {
    return (
      <section className="container narrow-page connect-page">
        <div className={`connect-card panel ${error ? 'is-error' : ''}`}>
          {error ? (
            <>
              <span className="eyebrow">Arena link failed</span>
              <h1>That room is out of reach.</h1>
              <p>{error}</p>
              <div className="connect-actions">
                <Link to="/" className="btn btn-secondary">
                  Back to arena
                </Link>
                <Link to="/solo?quick=1" className="btn btn-primary">
                  <Icon name="play" size={15} /> Play solo instead
                </Link>
              </div>
            </>
          ) : (
            <>
              <span className="spinner large" />
              <span className="eyebrow">Connecting to room {code?.toUpperCase()}</span>
              <h1>Opening the gate.</h1>
              <p>{reconnecting ? 'Reconnecting to the room server…' : 'Fetching the field, roster and referee seats.'}</p>
            </>
          )}
        </div>
      </section>
    );
  }

  if (!room) return null;

  if ((room.phase === 'running' || room.phase === 'finished') && setup && snapshot) {
    return (
      <MatchArena
        setup={setup}
        snapshot={snapshot}
        mode="remote"
        playerName={profile.name}
        role={self?.role}
        playerSlot={self?.slotIndex}
        humanAlliance={self?.humanAlliance}
        isReferee={isReferee}
        isHost={isHost}
        canManage={canManage}
        results={results}
        connectionState={connected ? 'connected' : reconnecting ? 'reconnecting' : 'offline'}
        onInput={sendInput}
        onHumanInput={sendHumanInput}
        onRefCommand={sendRef}
        onBack={() => navigate('/')}
        onRematch={canManage ? startMatch : undefined}
        onLobby={canManage ? returnToLobby : undefined}
        matchLabel={`SIMULATION ${room.matchCount} OF ${room.matchCount}`}
      />
    );
  }

  if (room.phase === 'running') {
    return (
      <section className="container narrow-page connect-page">
        <div className="connect-card panel">
          <span className="spinner large" />
          <span className="eyebrow">Match loading</span>
          <h1>Field is being assembled.</h1>
          <p>The room server is starting the authoritative simulation.</p>
        </div>
      </section>
    );
  }

  const mode = room.settings.mode;
  const activeSlots = room.slots
    .filter((slot) => slotIsActive(mode, slot))
    .sort((a, b) => (a.alliance === b.alliance ? a.position - b.position : a.alliance === 'red' ? -1 : 1));
  const redSlots = activeSlots.filter((slot) => slot.alliance === 'red');
  const blueSlots = activeSlots.filter((slot) => slot.alliance === 'blue');
  const occupied = room.slots.filter((slot) => slotIsActive(mode, slot) && slot.driverId).length;
  const readyCount = room.slots.filter((slot) => slotIsActive(mode, slot) && slot.driverId && slot.ready).length;
  const referee = room.members.find((member) => member.id === room.refereeId);
  const canEditField = canManage;

  const renderSlot = (slot: RoomSlot) => {
    const mine = self?.slotIndex === slot.index;
    const driver = room.members.find((member) => member.id === slot.driverId);
    const bot = availableBots.find((entry) => entry.id === slot.botId) ?? {
      id: slot.botId ?? 'bot',
      name: slot.botName ?? 'Robot',
      teamNumber: slot.botConfig?.teamNumber ?? 0,
      config: slot.botConfig ?? PRESET_BOTS[0].config,
      preset: true,
      description: '',
      createdAt: '',
      updatedAt: '',
    };
    const canChangeBot = Boolean(mine || canManage);
    return (
      <article className={`seat-card ${slot.alliance} ${mine ? 'is-mine' : ''} ${driver ? 'is-filled' : 'is-open'}`} key={slot.index}>
        <div className="seat-avatar">
          <BotAvatar config={bot.config} alliance={slot.alliance} size={66} />
        </div>
        <div className="seat-main">
          <div className="seat-topline">
            <span className="seat-label">
              {slot.alliance === 'red' ? 'RED' : 'BLUE'} {slot.position + 1}
              {mine && <em>YOU</em>}
            </span>
            <span className={`seat-state ${driver ? 'human' : 'ai'}`}>
              <span className="status-dot" />
              {driver ? 'DRIVER' : 'AI / OPEN'}
            </span>
          </div>
          <div className="seat-name-row">
            <strong>{driver?.name ?? 'Open seat'}</strong>
            <span>#{bot.teamNumber} {bot.name}</span>
          </div>
          {canChangeBot ? (
            <select
              className="seat-bot-select"
              value={slot.botId ?? ''}
              onChange={(event) => selectBot(event.target.value, slot.index)}
              aria-label={`Choose robot for ${slot.alliance} ${slot.position + 1}`}
            >
              {availableBots.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  #{entry.teamNumber} {entry.name}
                  {entry.preset ? ' · preset' : ' · custom'}
                </option>
              ))}
            </select>
          ) : (
            <span className="seat-bot-name">#{bot.teamNumber} · {bot.name}</span>
          )}
          <div className="seat-actions">
            {!driver && (
              <button type="button" className="btn btn-secondary btn-xs" onClick={() => claimSlot(slot.index, slot.botId)}>
                <Icon name="user" size={13} /> Take seat
              </button>
            )}
            {mine && (
              <>
                <button
                  type="button"
                  className={`btn btn-xs ${slot.ready ? 'btn-success' : 'btn-ghost'}`}
                  onClick={() => setReady(!slot.ready)}
                >
                  <Icon name="check" size={12} /> {slot.ready ? 'Ready' : 'Ready up'}
                </button>
                <button type="button" className="btn btn-ghost btn-xs" onClick={leaveSlot}>
                  Leave
                </button>
              </>
            )}
            {canManage && !driver && (
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => (slot.ready ? removeAI(slot.index) : addAI(slot.index, slot.botId))}
              >
                <Icon name="bot" size={12} /> {slot.ready ? 'AI ready' : 'Set AI'}
              </button>
            )}
          </div>
        </div>
      </article>
    );
  };

  const renderHumanSeat = (alliance: Alliance) => {
    const human = room.humans.find((entry) => entry.alliance === alliance);
    const occupiedByMe = human?.memberId === self?.id;
    return (
      <div className={`human-seat-card ${alliance}`} key={alliance}>
        <span className="human-seat-icon">
          <Icon name="user" size={16} />
        </span>
        <div>
          <span className="eyebrow">{alliance.toUpperCase()} HUMAN PLAYER</span>
          <strong>{human?.controller === 'human' ? human.name : 'AI feeding'}</strong>
        </div>
        {occupiedByMe ? (
          <span className="chip">YOUR SEAT</span>
        ) : human?.controller === 'human' ? (
          <span className="chip">TAKEN</span>
        ) : (
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => setRole('human', alliance)}>
            Take seat
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="room-page">
      <section className="container room-head">
        <div className="room-title-block">
          <span className="eyebrow">
            <span className={`live-dot ${connected ? '' : 'offline'}`} /> {connected ? 'ROOM ONLINE' : 'RECONNECTING'} ·{' '}
            {room.settings.mode.toUpperCase()}
          </span>
          <h1>{room.name}</h1>
          <div className="room-code-line">
            <span>CODE</span>
            <b>{room.code}</b>
            <button type="button" className="copy-code" onClick={copyInvite}>
              <Icon name={copied ? 'check' : 'copy'} size={15} /> {copied ? 'Copied' : 'Copy invite'}
            </button>
            <button type="button" className="btn btn-ghost btn-xs share-btn" onClick={shareInvite}>
              Share
            </button>
          </div>
        </div>
        <div className="room-head-right">
          <div className="room-capacity">
            <span className="eyebrow">Drivers</span>
            <strong>
              {occupied}/{activeSlots.length}
            </strong>
            <div className="capacity-pips">
              {activeSlots.map((slot) => (
                <i key={slot.index} className={`${slot.alliance} ${slot.driverId ? 'filled' : ''}`} />
              ))}
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>
            <Icon name="chevronLeft" size={14} /> Leave
          </button>
        </div>
      </section>

      <section className="container room-layout">
        <div className="room-main">
          <div className="lobby-status-strip panel">
            <div className="lobby-status-left">
              {self ? (
                <span>
                  <span className="status-dot online" /> You are{' '}
                  <b>
                    {self.role === 'driver'
                      ? `RED ${((self.slotIndex ?? 0) % 3) + 1} driver`
                      : self.role === 'human'
                        ? `${self.humanAlliance?.toUpperCase()} human player`
                        : self.role === 'referee'
                          ? 'head referee'
                          : 'spectating'}
                  </b>
                </span>
              ) : (
                <span>Joining the room…</span>
              )}
            </div>
            <div className="lobby-status-right">
              <span>{readyCount} ready</span>
              <span>{room.members.filter((m) => m.connected).length} connected</span>
              {isHost && <span className="host-chip"><Icon name="crown" size={12} /> HOST</span>}
            </div>
          </div>

          <div className="alliance-columns">
            <section className="alliance-panel red">
              <div className="alliance-panel-head">
                <div>
                  <span className="alliance-flag" />
                  <h2>RED ALLIANCE</h2>
                </div>
                <span>{redSlots.length} robots</span>
              </div>
              <div className="seat-list">{redSlots.map(renderSlot)}</div>
              {renderHumanSeat('red')}
            </section>
            <section className="alliance-panel blue">
              <div className="alliance-panel-head">
                <div>
                  <span className="alliance-flag" />
                  <h2>BLUE ALLIANCE</h2>
                </div>
                <span>{blueSlots.length} robots</span>
              </div>
              <div className="seat-list">{blueSlots.map(renderSlot)}</div>
              {renderHumanSeat('blue')}
            </section>
          </div>

          <div className="room-controls-row">
            <div className="room-settings-panel panel">
              <div className="panel-head">
                <div>
                  <span className="eyebrow">Room setup</span>
                  <h2>Match conditions</h2>
                </div>
                {!canManage && <span className="read-only-chip"><Icon name="lock" size={12} /> Host control</span>}
              </div>
              <div className="settings-grid">
                <div className="form-group">
                  <span className="field-label">Format</span>
                  <div className="segmented small">
                    {(['1v1', '2v2', '3v3'] as MatchMode[]).map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={room.settings.mode === option ? 'is-active' : ''}
                        disabled={!canManage}
                        onClick={() => updateSettings({ mode: option })}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="form-group">
                  <label className="field-label" htmlFor="room-field">
                    Field
                  </label>
                  <select
                    id="room-field"
                    className="select"
                    value={room.settings.fieldId}
                    disabled={!canEditField}
                    onChange={(event) => updateSettings({ fieldId: event.target.value })}
                  >
                    <option value={REBUILT_FIELD.id}>{REBUILT_FIELD.name}</option>
                    {fields
                      .filter((field) => field.id !== REBUILT_FIELD.id)
                      .map((field) => (
                        <option key={field.id} value={field.id}>
                          {field.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="form-group toggle-group">
                  <span className="field-label">Auto-fill empty seats with AI</span>
                  <button
                    type="button"
                    className={`switch ${room.settings.autoFillAI ? 'on' : ''}`}
                    role="switch"
                    aria-checked={room.settings.autoFillAI}
                    disabled={!canManage}
                    onClick={() => updateSettings({ autoFillAI: !room.settings.autoFillAI })}
                  >
                    <span />
                  </button>
                </div>
                <div className="form-group">
                  <label className="field-label" htmlFor="judgment">
                    Judgment calls
                  </label>
                  <select
                    id="judgment"
                    className="select"
                    value={room.settings.judgmentPolicy}
                    disabled={!canManage}
                    onChange={(event) =>
                      updateSettings({ judgmentPolicy: event.target.value as 'auto' | 'manual' })
                    }
                  >
                    <option value="auto">Auto-confirm reviews after 6s</option>
                    <option value="manual">Referee confirms every review</option>
                  </select>
                </div>
                <div className="form-group toggle-group">
                  <span className="field-label">Automatic rule calls</span>
                  <button
                    type="button"
                    className={`switch ${room.settings.autoEnforcement ? 'on' : ''}`}
                    role="switch"
                    aria-checked={room.settings.autoEnforcement}
                    disabled={!canManage}
                    onClick={() => updateSettings({ autoEnforcement: !room.settings.autoEnforcement })}
                  >
                    <span />
                  </button>
                </div>
              </div>
              <p className="helper">
                With automatic calls off, objective calls become pending reviews. The head referee can
                always confirm, overturn or manually call a foul.
              </p>
            </div>

            <div className="roles-panel panel">
              <div className="panel-head">
                <div>
                  <span className="eyebrow">Table seats</span>
                  <h2>Referee & spectators</h2>
                </div>
              </div>
              <div className="referee-seat-card">
                <span className="referee-seat-icon"><Icon name="shield" size={20} /></span>
                <div>
                  <span className="eyebrow">HEAD REFEREE</span>
                  <strong>{referee?.name ?? 'Seat open'}</strong>
                  <small>{referee ? 'Can pause, call fouls and issue cards' : 'Takes the final call on judgment events'}</small>
                </div>
                {referee?.id === self?.id ? (
                  <span className="chip">YOUR SEAT</span>
                ) : referee ? (
                  <span className="chip">TAKEN</span>
                ) : (
                  <button type="button" className="btn btn-secondary btn-xs" onClick={() => setRole('referee')}>
                    Be referee
                  </button>
                )}
              </div>
              <div className="spectator-row">
                <span>
                  <Icon name="users" size={15} /> {room.members.filter((m) => m.role === 'spectator').length} spectators
                </span>
                {self?.role !== 'spectator' && (
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => setRole('spectator')}>
                    Spectate
                  </button>
                )}
              </div>
              <div className="member-list">
                {room.members.map((member) => (
                  <div className={`member-row ${member.id === self?.id ? 'is-self' : ''}`} key={member.id}>
                    <span className="member-avatar">{member.name.slice(0, 1).toUpperCase()}</span>
                    <span className="member-name">
                      {member.name}
                      {member.isHost && <em>HOST</em>}
                    </span>
                    <span className={`member-role role-${member.role}`}>
                      {member.role === 'driver'
                        ? `${member.slotIndex !== undefined && member.slotIndex >= 3 ? 'BLUE' : 'RED'} DRIVER`
                        : member.role === 'human'
                          ? `${member.humanAlliance?.toUpperCase()} HP`
                          : member.role.toUpperCase()}
                    </span>
                    <span className={`member-dot ${member.connected ? '' : 'offline'}`} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="start-bar panel">
            <div className="start-bar-info">
              <strong>
                {canManage ? 'Ready when you are.' : 'Waiting for the host.'}
              </strong>
              <span>
                {occupied}/{activeSlots.length} human drivers · {activeSlots.length - occupied} AI seats will fill
              </span>
            </div>
            <div className="start-bar-actions">
              {canManage ? (
                <button type="button" className="btn btn-primary btn-lg" onClick={startMatch}>
                  <Icon name="play" size={17} /> Start match
                </button>
              ) : (
                <button type="button" className="btn btn-secondary btn-lg" onClick={() => claimSlot(activeSlots.find((slot) => !slot.driverId)?.index ?? 0)} disabled={occupied >= activeSlots.length}>
                  {occupied >= activeSlots.length ? 'Room full' : 'Take an open seat'}
                </button>
              )}
            </div>
          </div>
        </div>

        <aside className="room-chat panel">
          <div className="chat-head">
            <div>
              <span className="eyebrow">Drive team channel</span>
              <h2>Room chat</h2>
            </div>
            <span className="chat-online">
              <span className="status-dot" /> {room.members.filter((m) => m.connected).length}
            </span>
          </div>
          <div className="chat-body" ref={chatBody}>
            {chat.length === 0 && (
              <div className="chat-empty">
                <Logo compact />
                <p>Say hello. Share a strategy. Don’t share your pin count.</p>
              </div>
            )}
            {chat.map((message) => (
              <div className={`chat-message ${message.system ? 'system' : ''}`} key={message.id}>
                {!message.system && <span className="chat-author">{message.name}</span>}
                <p>{message.text}</p>
                <time>{new Date(message.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
              </div>
            ))}
          </div>
          <form
            className="chat-input"
            onSubmit={(event) => {
              event.preventDefault();
              submitChat();
            }}
          >
            <input
              className="input"
              placeholder="Message the room…"
              value={chatText}
              onChange={(event) => setChatText(event.target.value.slice(0, 200))}
              disabled={!connected}
            />
            <button type="submit" className="send-btn" aria-label="Send message" disabled={!chatText.trim() || !connected}>
              <Icon name="send" size={17} />
            </button>
          </form>
          <div className="chat-footer">
            <span>{inviteUrl.replace(/^https?:\/\//, '')}</span>
            <button type="button" className="text-btn" onClick={copyInvite}>
              <Icon name="copy" size={12} /> Copy
            </button>
          </div>
        </aside>
      </section>
    </div>
  );
}
