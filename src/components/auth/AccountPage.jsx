import { useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthProvider.jsx';
import { BookFrame } from '../diary/DiaryBook.jsx';
import { Icon, WeatherIcon } from '../diary/WeatherIcon.jsx';
import '../../diary.css';
import '../../auth.css';

export function AccountPage({ settings = false, onBack }) {
  const auth = useAuth();
  const [mode, setMode] = useState('login');
  const registering = !settings && mode === 'register';
  const [username, setUsername] = useState(settings ? auth.user.username : '');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const title = useRef(null);
  useEffect(() => { title.current?.focus({ preventScroll: true }); }, [mode]);
  const titleText = settings ? '我的账户' : registering ? '开启你的日记本' : '回到你的日记本';
  const settingPassword = settings && auth.user.needsPassword;
  async function submit(event) {
    event.preventDefault();
    if (busyRef.current) return;
    setError(''); setNotice('');
    if ((registering && password !== confirm) || (settings && newPassword !== confirm)) {
      setError('两次输入的密码不一致，请再检查一下。'); return;
    }
    busyRef.current = true; setBusy(true);
    try {
      if (settings) {
        await auth.updateAccount({ username, currentPassword: password, newPassword });
        setPassword(''); setNewPassword(''); setConfirm('');
        setNotice('账户信息已保存。下次请使用新的用户名和密码登录。');
      } else {
        await (registering ? auth.register : auth.login)({ username, password });
      }
    } catch (failure) { setError(failure.message); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function logout() {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try { await auth.logout(); onBack(); }
    catch (failure) { setError(failure.message); }
    finally { busyRef.current = false; setBusy(false); }
  }
  function switchMode(next) {
    setMode(next); setPassword(''); setConfirm(''); setError(''); setNotice(''); setShowPassword(false);
  }
  return <main className="diary-shell auth-shell">
    <div className="diary-atmosphere" aria-hidden="true" />
    <div className="diary-layout auth-layout">
      <header className="diary-topbar">
        <div>
          <button type="button" className="diary-back" onClick={onBack} disabled={busy}><Icon name="arrow-left" />{settings ? '回到日记本' : '回到星光里'}</button>
          <h1 ref={title} tabIndex={-1}>{titleText}</h1>
          <p className="diary-subtitle">{settings ? '把名字与密码，好好收在这里。' : '登录后，翻开只属于你的那一页。'}</p>
        </div>
        {settings ? <button type="button" className="auth-logout" onClick={logout} disabled={busy}>退出登录</button> : null}
      </header>
      <BookFrame className="auth-book">
        <section className="diary-paper auth-intro" aria-label="你的日记本">
          <span className="auth-bookmark">星光树洞</span>
          <Icon name="book" size={38} />
          <h2>{settings ? `${auth.user.username} 的日记本` : '心事有它的归处'}</h2>
          <p>晴天或雨天，<br />每一种心情，都值得留下。</p>
          <div className="auth-weather" aria-hidden="true"><WeatherIcon weather="sunny" size={34} /><WeatherIcon weather="cloudy" size={34} /><WeatherIcon weather="rainy" size={34} /></div>
          <span className="auth-private-note">日记只向登录的你开放。</span>
        </section>
        <section className="diary-paper auth-form-page" aria-label={settings ? '修改账户信息' : '账户登录与注册'}>
          {settings ? <h2 className="auth-form-title">{settingPassword ? '为日记本设置密码' : '修改账户信息'}</h2> : <div className="auth-tabs" aria-label="选择账户操作">
            <button type="button" aria-pressed={!registering} disabled={busy} onClick={() => switchMode('login')}>登录</button>
            <button type="button" aria-pressed={registering} disabled={busy} onClick={() => switchMode('register')}>注册</button>
          </div>}
          <form className="auth-form" onSubmit={submit} aria-busy={busy}>
            <label htmlFor="auth-username">用户名</label>
            <input id="auth-username" name="username" autoComplete="username" value={username} required minLength={2} maxLength={32} disabled={busy} onChange={(event) => setUsername(event.target.value)} placeholder="你的名字" aria-describedby="username-hint" />
            <span id="username-hint" className="auth-hint">2–32 个字，支持中文、字母和数字。</span>
            <div className="auth-password-label"><label htmlFor="auth-password">{settings ? '当前密码' : '密码'}</label><button type="button" disabled={busy} aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)}>{showPassword ? '隐藏密码' : '显示密码'}</button></div>
            <input id="auth-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={registering ? 'new-password' : 'current-password'} value={password} required={registering || (settings && !settingPassword)} minLength={registering ? 8 : undefined} maxLength={128} disabled={busy} onChange={(event) => setPassword(event.target.value)} placeholder={settingPassword ? '尚无密码，保持留空' : registering ? '至少 8 个字符' : '输入你的密码'} />
            {settings ? <><label htmlFor="auth-new-password">{settingPassword ? '设置密码' : '新密码'}</label><input id="auth-new-password" name="newPassword" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={newPassword} minLength={8} maxLength={128} required={settingPassword} disabled={busy} onChange={(event) => setNewPassword(event.target.value)} placeholder={settingPassword ? '至少 8 个字符' : '不修改密码时留空'} /></> : null}
            {registering || settings ? <><label htmlFor="auth-confirm">{settings ? '确认新密码' : '确认密码'}</label><input id="auth-confirm" name="confirmPassword" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={confirm} required={registering || Boolean(newPassword)} maxLength={128} disabled={busy} onChange={(event) => setConfirm(event.target.value)} placeholder="再输入一次" /></> : null}
            {error ? <p className="auth-message auth-error" role="alert">{error}</p> : null}
            {notice ? <p className="auth-message" role="status">{notice}</p> : null}
            <button type="submit" className="diary-primary auth-submit" disabled={busy}>{busy ? '正在处理……' : settings ? '保存账户信息' : registering ? '注册并打开日记本' : '登录并打开日记本'}<Icon name="chevron-right" size={17} /></button>
            <p className="auth-hint auth-bottom-hint">{settingPassword ? '设置后，空密码登录将立即失效。' : settings ? '修改信息需验证当前密码，其他设备将退出登录。' : registering ? '注册后，你会得到一本空白的私人日记。' : '使用你的用户名和密码继续。'}</p>
          </form>
        </section>
      </BookFrame>
    </div>
  </main>;
}
