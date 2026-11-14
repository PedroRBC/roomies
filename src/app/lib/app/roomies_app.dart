import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';

import '../shared/theme/roomies_theme.dart';
import '../shared/widgets/roomies_ui.dart';
import 'app_state.dart';
import 'router.dart';

class RoomiesApp extends StatefulWidget {
  const RoomiesApp({super.key, required this.appState});

  final AppState appState;

  @override
  State<RoomiesApp> createState() => _RoomiesAppState();
}

class _RoomiesAppState extends State<RoomiesApp> {
  late final _router = createRouter(widget.appState);

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider.value(
      value: widget.appState,
      child: Consumer<AppState>(
        builder: (context, app, _) {
          final locale = switch (app.localeCode) {
            'pt' => const Locale('pt', 'BR'),
            'es' => const Locale('es'),
            _ => const Locale('en'),
          };
          return MaterialApp.router(
            title: 'Roomies',
            theme: buildRoomiesTheme(
              brightness: Brightness.light,
              brand: app.brandAccent,
            ),
            darkTheme: buildRoomiesTheme(
              brightness: Brightness.dark,
              brand: app.brandAccent,
            ),
            themeMode: app.themeMode,
            locale: locale,
            supportedLocales: const [
              Locale('en'),
              Locale('pt', 'BR'),
              Locale('es'),
            ],
            localizationsDelegates: const [
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
              GlobalCupertinoLocalizations.delegate,
            ],
            routerConfig: _router,
            builder: (context, child) {
              if (!app.sessionReady) {
                // Mirrors the HTML boot splash in web/index.html.
                return RoomiesAtmosphere(
                  child: Center(
                    child: Semantics(
                      label: app.strings.restoringSession,
                      excludeSemantics: true,
                      child: const RoomiesWordmark(size: 52),
                    ),
                  ),
                );
              }
              return child ?? const SizedBox.shrink();
            },
          );
        },
      ),
    );
  }
}
