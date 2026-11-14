import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_web_plugins/url_strategy.dart';

import 'app/app_state.dart';
import 'app/roomies_app.dart';
import 'core/api/api_client.dart';
import 'core/datetime_format.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (kIsWeb) {
    SemanticsBinding.instance.ensureSemantics();
  }
  usePathUrlStrategy();
  await ensureDateFormatting();
  final api = ApiClient(webOrigin: kIsWeb ? Uri.base.origin : null);
  if (!kIsWeb) requireEncryptedApiBase(api.baseUrl);
  final appState = AppState(api, deviceLocales: platformLocaleTags());
  await appState.restoreSession();
  runApp(RoomiesApp(appState: appState));
}
