import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:roomies/core/api/api_client.dart';
import 'package:roomies/features/auth/login_screen.dart';
import 'package:roomies/app/app_state.dart';
import 'package:roomies/shared/theme/roomies_theme.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Future<void> pumpLogin(WidgetTester tester, http.Client client) async {
    final appState = AppState(
      ApiClient(baseUrl: 'http://example/api', httpClient: client),
      deviceLocale: 'en-US',
    )..sessionReady = true;
    final router = GoRouter(
      routes: [
        GoRoute(path: '/', builder: (_, __) => const LoginScreen()),
        GoRoute(path: '/settings', builder: (_, __) => const Text('settings')),
      ],
    );
    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: appState,
        child: MaterialApp.router(
          theme: buildRoomiesTheme(),
          routerConfig: router,
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets(
      'shows email and password immediately and keeps Settings reachable',
      (tester) async {
    await pumpLogin(tester, MockClient((_) async => http.Response('{}', 200)));
    expect(find.widgetWithText(TextFormField, 'Email'), findsOneWidget);
    expect(find.widgetWithText(TextFormField, 'Password'), findsOneWidget);
    expect(find.text('Use email and password'), findsNothing);
    await tester.tap(find.byTooltip('Settings'));
    await tester.pumpAndSettle();
    expect(find.text('settings'), findsOneWidget);
  });

  testWidgets('validates empty fields before making a request', (tester) async {
    var calls = 0;
    await pumpLogin(tester, MockClient((_) async {
      calls++;
      return http.Response('{}', 200);
    }));
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pumpAndSettle();
    expect(find.text('Email is required.'), findsOneWidget);
    expect(calls, 0);
  });

  testWidgets('reports a sign-in error without hiding the form',
      (tester) async {
    await pumpLogin(
        tester,
        MockClient((_) async =>
            http.Response('{"error":"invalid email or password"}', 401)));
    await tester.enterText(
        find.widgetWithText(TextFormField, 'Email'), 'alex@example.com');
    await tester.enterText(
        find.widgetWithText(TextFormField, 'Password'), 'password123');
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pumpAndSettle();
    expect(find.textContaining('invalid email or password'), findsOneWidget);
    expect(find.widgetWithText(TextFormField, 'Password'), findsOneWidget);
  });
}
