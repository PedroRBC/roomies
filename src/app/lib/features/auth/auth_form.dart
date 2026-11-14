import 'package:flutter/material.dart';
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
  var _loading = false;
  var _showPassword = false;
  String? _error;

  @override
  void dispose() {
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
    final navigator = GoRouter.of(context);
    try {
      final auth = widget.register
          ? await app.api
              .register(_name.text.trim(), _email.text.trim(), _password.text)
          : await app.api.login(_email.text.trim(), _password.text);
      await app.setUser(auth.user);
      final pending = await app.api.loadPendingInvitation();
      if (!mounted) return;
      navigator.go(pending != null && pending.isNotEmpty
          ? '/accept-invitation'
          : '/dashboard');
    } catch (error) {
      if (!mounted) return;
      setState(() => _error =
          describeError(error, unreachable: app.strings.serverUnreachable));
    } finally {
      if (mounted) setState(() => _loading = false);
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
              Text(widget.register ? s.makeYourselfAtHome : s.welcomeHome,
                  style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 8),
              Text(
                  widget.register ? s.registerDescription : s.loginDescription),
              const SizedBox(height: 24),
              if (_error != null) RoomiesError(_error!),
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
                        : () => setState(() => _showPassword = !_showPassword),
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
              const SizedBox(height: 24),
              FilledButton(
                style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(52)),
                onPressed: _loading ? null : _submit,
                child: Text(_loading
                    ? (widget.register ? s.registering : s.loggingIn)
                    : (widget.register ? s.createAccount : s.signIn)),
              ),
              const SizedBox(height: 12),
              TextButton(
                onPressed: _loading
                    ? null
                    : () => context.go(widget.register ? '/' : '/register'),
                child:
                    Text(widget.register ? s.haveAccountLogin : s.newAccount),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
