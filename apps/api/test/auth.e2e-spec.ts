import { TestApp, expectStatus } from './helpers.js';

describe('Auth + OTP (e2e)', () => {
  const t = new TestApp();
  beforeAll(() => t.start());
  afterAll(() => t.stop());

  const phone = () => `09${(Date.now() + Math.floor(Math.random() * 1_000_000)).toString().slice(-8)}`;

  it('requires OTP to register and validates phone numbers', async () => {
    await expectStatus(t.call('post', '/auth/register', { body: { phone: phone(), password: 'secret123', fullName: 'x', role: 'CUSTOMER' } }), 400, 'OTP');
    await expectStatus(t.call('post', '/auth/otp/send', { body: { phone: '12345', purpose: 'REGISTER' } }), 400, 'không hợp lệ');
  });

  it('sends, throttles resends, verifies once, and binds the token to phone + purpose', async () => {
    const p = phone();
    const sent = await t.call('post', '/auth/otp/send', { body: { phone: `+84 ${p.slice(1)}`, purpose: 'REGISTER' } });
    expect(sent.phone).toBe(`+84${p.slice(1)}`);
    expect(sent.devCode).toMatch(/^\d{6}$/);
    await expectStatus(t.call('post', '/auth/otp/send', { body: { phone: p, purpose: 'REGISTER' } }), 429);
    await expectStatus(t.call('post', '/auth/otp/verify', { body: { phone: p, purpose: 'REGISTER', code: '000000' } }), 400, 'còn 4');
    const ver = await t.call('post', '/auth/otp/verify', { body: { phone: p, purpose: 'REGISTER', code: sent.devCode } });
    expect(ver.verificationToken).toBeTruthy();
    await expectStatus(t.call('post', '/auth/otp/verify', { body: { phone: p, purpose: 'REGISTER', code: sent.devCode } }), 400);
    await expectStatus(t.call('post', '/auth/register', { body: { phone: phone(), password: 'secret123', fullName: 'x', role: 'CUSTOMER', verificationToken: ver.verificationToken } }), 400);
    const reg = await t.call('post', '/auth/register', { body: { phone: p, password: 'secret123', fullName: 'OTP user', role: 'CUSTOMER', verificationToken: ver.verificationToken } });
    expect(reg.user.phone).toBe(p);
    expect(reg.refreshToken).toBeTruthy();
    const login = await t.call('post', '/auth/login', { body: { phone: `+84${p.slice(1)}`, password: 'secret123' } });
    expect(login.user.phone).toBe(p);
  });

  it('rotates refresh tokens and revokes on logout', async () => {
    const s = await t.register('CUSTOMER');
    const r1 = await t.call('post', '/auth/refresh', { body: { refreshToken: s.refreshToken } });
    expect(r1.accessToken).toBeTruthy();
    expect(r1.refreshToken).not.toBe(s.refreshToken);
    await expectStatus(t.call('post', '/auth/refresh', { body: { refreshToken: s.refreshToken } }), 401); // consumed
    await t.call('post', '/auth/logout', { token: r1.accessToken, body: { refreshToken: r1.refreshToken } });
    await expectStatus(t.call('get', '/wallet/me', { token: r1.accessToken }), 401); // access blocked
    await expectStatus(t.call('post', '/auth/refresh', { body: { refreshToken: r1.refreshToken } }), 401);
  });

  it('locks the account after 5 failed logins', async () => {
    const s = await t.register('CUSTOMER');
    for (let i = 0; i < 5; i++) {
      await expectStatus(t.call('post', '/auth/login', { body: { phone: s.user.phone, password: 'wrong' } }), 401);
    }
    await expectStatus(t.call('post', '/auth/login', { body: { phone: s.user.phone, password: 'secret123' } }), 429, 'tạm khoá');
  });

  it('resets the password with a RESET_PASSWORD token and ends other sessions', async () => {
    const s = await t.register('CUSTOMER');
    const sent = await t.call('post', '/auth/otp/send', { body: { phone: s.user.phone, purpose: 'RESET_PASSWORD' } });
    const ver = await t.call('post', '/auth/otp/verify', { body: { phone: s.user.phone, purpose: 'RESET_PASSWORD', code: sent.devCode } });
    await expectStatus(t.call('post', '/auth/register', { body: { phone: s.user.phone, password: 'x', fullName: 'x', role: 'CUSTOMER', verificationToken: ver.verificationToken } }), 400);
    await t.call('post', '/auth/password/reset', { body: { phone: s.user.phone, verificationToken: ver.verificationToken, newPassword: 'newpass456' } });
    await expectStatus(t.call('post', '/auth/login', { body: { phone: s.user.phone, password: 'secret123' } }), 401);
    await expectStatus(t.call('post', '/auth/refresh', { body: { refreshToken: s.refreshToken } }), 401);
    const ok = await t.call('post', '/auth/login', { body: { phone: s.user.phone, password: 'newpass456' } });
    expect(ok.user.id).toBe(s.user.id);
  });
});
