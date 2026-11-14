import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/api/api_client.dart';
import '../../core/models/models.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app/app_state.dart';
import '../../core/api/api_error.dart';
import '../../shared/widgets/roomies_ui.dart';

class AuthForm extends StatefulWidget {
  const AuthForm({super.key, this.register = false});
  final bool register;

  @override
  State<AuthForm> createState() => _AuthFormState();
}

class _AuthFormState extends State<AuthForm> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _code = TextEditingController();
  var _factor = false;
  var _backup = false;
  var _google = false;
  var _googleRun = 0;
  var _googlePending = false;
  @override
  void initState() {
    super.initState();
    context.read<AppState>().api.googleAvailable().then((value) {
      if (mounted) setState(() => _google = value);
    }).catchError((Object _) {});
  }

  var _loading = false;
  var _showPassword = false;
  String? _error;

  @override
  void dispose() {
    _googleRun++;
    _code.dispose();
    _name.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_loading || !_form.currentState!.validate()) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    final app = context.read<AppState>();

    try {
      final auth = _factor
          ? await app.api.verifyTwoFactor(_code.text, backup: _backup)
          : widget.register
              ? await app.api.register(
                  _name.text.trim(), _email.text.trim(), _password.text)
              : await app.api.login(_email.text.trim(), _password.text);
      await _signedIn(auth);
    } on TwoFactorRequired {
      if (mounted) {
        setState(() {
          _factor = true;
          _password.clear();
        });
      }
    } catch (error) {
      if (!mounted) return;
      setState(() => _error =
          describeError(error, unreachable: app.strings.serverUnreachable));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _signedIn(AuthResponse auth) async {
    final app = context.read<AppState>();
    final navigator = GoRouter.of(context);
    await app.setUser(auth.user);
    final pending = await app.api.loadPendingInvitation();
    if (mounted) {
      navigator.go(pending != null && pending.isNotEmpty
          ? '/accept-invitation'
          : '/dashboard');
    }
  }

  Future<void> _signInGoogle() async {
    final app = context.read<AppState>();
    final run = ++_googleRun;
    setState(() {
      _loading = true;
      _googlePending = true;
      _error = null;
    });
    try {
      final flow = await app.api.startGoogle();
      if (!mounted || run != _googleRun) return;
      if (!await launchUrl(Uri.parse(flow['url'] as String),
          mode: kIsWeb
              ? LaunchMode.platformDefault
              : LaunchMode.externalApplication,
          webOnlyWindowName: '_self')) {
        throw StateError('Could not open the browser');
      }
      if (kIsWeb) return;
      for (var attempt = 0; attempt < 150; attempt++) {
        await Future<void>.delayed(const Duration(seconds: 2));
        if (!mounted || run != _googleRun) return;
        final auth = await app.api.pollGoogle(flow);
        if (!mounted || run != _googleRun) return;
        if (auth != null) {
          await app.api.adoptAuth(auth);
          await _signedIn(auth);
          return;
        }
      }
      throw StateError('Sign-in expired. Try again.');
    } catch (error) {
      if (mounted && run == _googleRun) {
        setState(() => _error =
            describeError(error, unreachable: app.strings.serverUnreachable));
      }
    } finally {
      if (mounted && run == _googleRun) {
        setState(() {
          _loading = false;
          _googlePending = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>().strings;
    return RoomiesAuthFrame(
      strings: s,
      onOpenSettings: () => context.go('/settings'),
      footer: s.privacyLine,
      child: AutofillGroup(
        child: Form(
          key: _form,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                  _factor
                      ? s.accountSecurity
                      : widget.register
                          ? s.makeYourselfAtHome
                          : s.welcomeHome,
                  style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 8),
              Text(_factor
                  ? s.factorDescription
                  : widget.register
                      ? s.registerDescription
                      : s.loginDescription),
              const SizedBox(height: 24),
              if (_error != null) RoomiesError(_error!),
              if (_factor) ...[
                TextFormField(
                  controller: _code,
                  enabled: !_loading,
                  decoration: InputDecoration(
                      labelText: _backup ? s.recoveryCode : s.factorCode),
                  autofocus: true,
                  autocorrect: false,
                  autofillHints: const [AutofillHints.oneTimeCode],
                  keyboardType:
                      _backup ? TextInputType.text : TextInputType.number,
                  validator: (value) => value == null ||
                          (_backup
                              ? value.trim().isEmpty
                              : !RegExp(r'^\d{6}$').hasMatch(value))
                      ? s.factorCode
                      : null,
                  onFieldSubmitted: (_) => _submit(),
                ),
                TextButton(
                    onPressed: _loading
                        ? null
                        : () => setState(() {
                              _backup = !_backup;
                              _code.clear();
                              _error = null;
                            }),
                    child: Text(_backup ? s.useAuthenticator : s.useRecovery)),
              ] else ...[
                if (widget.register) ...[
                  TextFormField(
                    controller: _name,
                    enabled: !_loading,
                    decoration: InputDecoration(labelText: s.name),
                    autofillHints: const [AutofillHints.name],
                    textInputAction: TextInputAction.next,
                    maxLength: 100,
                    validator: (value) => value == null || value.trim().isEmpty
                        ? s.nameRequired
                        : null,
                  ),
                  const SizedBox(height: 12),
                ],
                TextFormField(
                  controller: _email,
                  enabled: !_loading,
                  decoration: InputDecoration(labelText: s.email),
                  keyboardType: TextInputType.emailAddress,
                  autofillHints: const [AutofillHints.email],
                  textInputAction: TextInputAction.next,
                  autocorrect: false,
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) {
                      return s.emailRequired;
                    }
                    return RegExp(r'^[^\s@]+@[^\s@]+$').hasMatch(value.trim())
                        ? null
                        : s.invalidEmail;
                  },
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _password,
                  enabled: !_loading,
                  decoration: InputDecoration(
                    labelText: s.password,
                    helperText: widget.register ? s.passwordLength : null,
                    suffixIcon: IconButton(
                      tooltip: _showPassword ? s.hidePassword : s.showPassword,
                      onPressed: _loading
                          ? null
                          : () =>
                              setState(() => _showPassword = !_showPassword),
                      icon: Icon(_showPassword
                          ? Icons.visibility_off_outlined
                          : Icons.visibility_outlined),
                    ),
                  ),
                  obscureText: !_showPassword,
                  autocorrect: false,
                  enableSuggestions: false,
                  autofillHints: [
                    widget.register
                        ? AutofillHints.newPassword
                        : AutofillHints.password
                  ],
                  textInputAction: TextInputAction.done,
                  validator: (value) =>
                      value == null || value.length < 8 || value.length > 128
                          ? s.passwordLength
                          : null,
                  onFieldSubmitted: (_) => _submit(),
                ),
              ],
              const SizedBox(height: 24),
              FilledButton(
                style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(52)),
                onPressed: _loading ? null : _submit,
                child: Text(_loading
                    ? (widget.register ? s.registering : s.loggingIn)
                    : (_factor
                        ? s.verifyCode
                        : widget.register
                            ? s.createAccount
                            : s.signIn)),
              ),
              const SizedBox(height: 12),
              if (_google && !_factor)
                OutlinedButton(
                    onPressed: _loading ? null : _signInGoogle,
                    child: Text(s.googleSignIn)),
              if (_loading && _googlePending) ...[
                Text(s.googleWaiting),
                TextButton(
                    onPressed: () => setState(() {
                          _googleRun++;
                          _loading = false;
                          _googlePending = false;
                        }),
                    child: Text(s.cancel))
              ],
              TextButton(
                onPressed: _loading
                    ? null
                    : () {
                        if (_factor) {
                          setState(() {
                            _factor = false;
                            _backup = false;
                            _code.clear();
                            _error = null;
                          });
                        } else {
                          context.go(widget.register ? '/' : '/register');
                        }
                      },
                child: Text(_factor
                    ? s.back
                    : widget.register
                        ? s.haveAccountLogin
                        : s.newAccount),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
