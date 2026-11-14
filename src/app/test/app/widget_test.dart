import 'package:flutter_test/flutter_test.dart';
import 'package:roomies/core/api/api_client.dart';
import 'package:roomies/app/roomies_app.dart';
import 'package:roomies/app/app_state.dart';

void main() {
  testWidgets('shows restoring session shell', (tester) async {
    final appState = AppState(
      ApiClient(baseUrl: 'http://example/api'),
      deviceLocale: 'en',
    );
    appState.sessionReady = false;
    final semantics = tester.ensureSemantics();
    await tester.pumpWidget(RoomiesApp(appState: appState));
    expect(find.text('Roomies'), findsOneWidget);
    expect(find.bySemanticsLabel('Restoring…'), findsOneWidget);
    semantics.dispose();
  });
}
