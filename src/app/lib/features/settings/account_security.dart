import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../app/app_state.dart';
import '../../core/api/api_error.dart';
import '../../shared/widgets/roomies_ui.dart';

class AccountSecurity extends StatefulWidget {
  const AccountSecurity({super.key});
  @override
  State<AccountSecurity> createState() => _AccountSecurityState();
}

class _AccountSecurityState extends State<AccountSecurity> {
  final _form = GlobalKey<FormState>();
  final _password = TextEditingController();
  final _code = TextEditingController();
  Map<String, dynamic>? _setup;
  var _backup = false;
  var _busy = false;
  var _saved = false;
  String? _error;
  @override
  void dispose() {
    _password.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy ||
        !_form.currentState!.validate() ||
        (_setup != null && !_saved)) {
      return;
    }
    final app = context.read<AppState>();
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (_setup != null) {
        await app.api.twoFactor('verify-totp', code: _code.text);
        await app.setUser(await app.api.me());
        if (mounted) {
          setState(() {
            _setup = null;
            _saved = false;
          });
        }
      } else if (app.user!.twoFactorEnabled) {
        await app.api.twoFactor('disable',
            password: _password.text, code: _code.text, backup: _backup);
        await app.setUser(await app.api.me());
      } else {
        final setup =
            await app.api.twoFactor('enable', password: _password.text);
        if (mounted) setState(() => _setup = setup);
      }
      _password.clear();
      _code.clear();
    } catch (error) {
      if (mounted) {
        setState(() => _error =
            describeError(error, unreachable: app.strings.serverUnreachable));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final s = app.strings;
    final enabled = app.user?.twoFactorEnabled == true;
    final uri = _setup?['totpURI'] as String?;
    return Card(
      margin: const EdgeInsets.only(bottom: 24),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Form(
            key: _form,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(s.accountSecurity,
                    style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 8),
                Text(enabled ? s.factorEnabled : s.factorDescription),
                if (_error != null) RoomiesError(_error!),
                const SizedBox(height: 16),
                if (uri != null) ...[
                  Text(s.scanAuthenticator),
                  const SizedBox(height: 12),
                  Center(
                      child: Semantics(
                          label: s.authenticator,
                          image: true,
                          child: Container(
                              color: Colors.white,
                              padding: const EdgeInsets.all(12),
                              child: QrImageView(data: uri, size: 200)))),
                  const SizedBox(height: 12),
                  SelectableText(Uri.parse(uri).queryParameters['secret'] ?? '',
                      style: const TextStyle(fontFamily: 'monospace')),
                  const SizedBox(height: 16),
                  Text(s.saveRecovery),
                  const SizedBox(height: 8),
                  SelectableText((_setup!['backupCodes'] as List).join('\n'),
                      style: const TextStyle(fontFamily: 'monospace')),
                  CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(s.recoverySaved),
                      value: _saved,
                      onChanged: _busy
                          ? null
                          : (value) => setState(() => _saved = value == true)),
                ] else
                  TextFormField(
                      controller: _password,
                      enabled: !_busy,
                      obscureText: true,
                      autocorrect: false,
                      enableSuggestions: false,
                      autofillHints: const [AutofillHints.password],
                      decoration: InputDecoration(labelText: s.factorPassword)),
                if (uri != null || enabled) ...[
                  const SizedBox(height: 12),
                  TextFormField(
                      controller: _code,
                      enabled: !_busy,
                      decoration: InputDecoration(
                          helperText: enabled ? s.factorRecentLogin : null,
                          helperMaxLines: 3,
                          labelText: _backup && enabled
                              ? s.recoveryCode
                              : s.factorCode),
                      autofillHints: const [AutofillHints.oneTimeCode],
                      keyboardType: _backup && enabled
                          ? TextInputType.text
                          : TextInputType.number,
                      maxLength: _backup && enabled ? 32 : 6,
                      validator: (value) => enabled && (value ?? '').isEmpty
                          ? null
                          : (_backup && enabled
                                  ? (value ?? '').trim().isNotEmpty
                                  : RegExp(r'^\d{6}$').hasMatch(value ?? ''))
                              ? null
                              : s.factorCode,
                      onFieldSubmitted: (_) => _submit()),
                ],
                if (enabled)
                  TextButton(
                      onPressed: _busy
                          ? null
                          : () => setState(() {
                                _backup = !_backup;
                                _code.clear();
                              }),
                      child:
                          Text(_backup ? s.useAuthenticator : s.useRecovery)),
                const SizedBox(height: 16),
                FilledButton(
                    onPressed:
                        _busy || (uri != null && !_saved) ? null : _submit,
                    child: Text(uri != null
                        ? s.confirmAuthenticator
                        : enabled
                            ? s.disableFactor
                            : s.setupAuthenticator)),
              ],
            )),
      ),
    );
  }
}
