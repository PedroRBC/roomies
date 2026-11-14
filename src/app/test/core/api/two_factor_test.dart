import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:roomies/core/api/api_client.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));
  const user = {
    'id': 'user',
    'name': 'Alex',
    'email': 'alex@example.test',
    'created_at': '2026-01-01'
  };
  test(
      'native login stays unauthenticated until TOTP and adopts rotated management token',
      () async {
    final requests = <http.Request>[];
    final api = ApiClient(
        baseUrl: 'https://roomies.test/api',
        httpClient: MockClient((request) async {
          requests.add(request);
          if (request.url.path.endsWith('/login')) {
            return http.Response(
                '{"two_factor_required":true,"challenge":"signed-challenge"}',
                200);
          }
          if (request.url.path.endsWith('/verify-totp')) {
            return http.Response(
                jsonEncode({'token': 'verified-token', 'user': user}), 200);
          }
          if (request.url.path.endsWith('/disable')) {
            return http.Response(
                '{"status":true,"token":"rotated-token"}', 200);
          }
          return http.Response(jsonEncode(user), 200);
        }));
    await expectLater(api.login('alex@example.test', 'password123'),
        throwsA(isA<TwoFactorRequired>()));
    expect(api.isAuthenticated, false);
    expect(api.hasSavedToken, false);
    await api.verifyTwoFactor('123456');
    expect(api.isAuthenticated, true);
    expect(jsonDecode(requests[1].body)['challenge'], 'signed-challenge');
    await api.twoFactor('disable',
        password: 'password123', code: 'recovery-code', backup: true);
    expect(jsonDecode(requests[2].body)['challenge'], isNull);
    expect(jsonDecode(requests[2].body)['backup'], true);
    expect(requests[2].headers['Authorization'], 'Bearer verified-token');
    await api.me();
    expect(requests.last.headers['Authorization'], 'Bearer rotated-token');
  });
  test(
      'abandoning an account challenge does not affect the next account security requests',
      () async {
    var first = true;
    final api = ApiClient(
        baseUrl: 'https://roomies.test/api',
        httpClient: MockClient((request) async {
          if (request.url.path.endsWith('/login')) {
            if (first) {
              first = false;
              return http.Response(
                  '{"two_factor_required":true,"challenge":"abandoned"}', 200);
            }
            return http.Response(
                jsonEncode({'token': 'new-account', 'user': user}), 200);
          }
          expect(jsonDecode(request.body)['challenge'], isNull);
          expect(request.headers['Authorization'], 'Bearer new-account');
          return http.Response(
              '{"totpURI":"otpauth://totp/Roomies","backupCodes":[]}', 200);
        }));
    await expectLater(api.login('first@example.test', 'password123'),
        throwsA(isA<TwoFactorRequired>()));
    await api.login('other@example.test', 'password123');
    await api.twoFactor('enable', password: 'password123');
  });
}
