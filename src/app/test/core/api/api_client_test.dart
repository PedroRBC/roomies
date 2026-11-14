import 'package:flutter_test/flutter_test.dart';
import 'package:roomies/core/api/api_client.dart';

void main() {
  test('resolveApiBaseUrl uses origin for relative web paths', () {
    expect(
      resolveApiBaseUrl(
        configured: '/api',
        webOrigin: 'https://app.example',
        isWeb: true,
      ),
      'https://app.example/api',
    );
  });

  test('resolveApiBaseUrl defaults to relative api on web', () {
    expect(resolveApiBaseUrl(isWeb: true), '/api');
  });

  test('resolveApiBaseUrl ignores baked localhost on public web origin', () {
    expect(
      resolveApiBaseUrl(
        configured: 'http://localhost:8080/api',
        webOrigin: 'https://roomies-dev.example',
        isWeb: true,
      ),
      'https://roomies-dev.example/api',
    );
    expect(
      resolveApiBaseUrl(
        configured: 'http://127.0.0.1:8080/api',
        webOrigin: 'https://roomies-dev.example',
        isWeb: true,
      ),
      'https://roomies-dev.example/api',
    );
  });

  test('resolveApiBaseUrl keeps localhost when page is also loopback', () {
    expect(
      resolveApiBaseUrl(
        configured: 'http://localhost:8080/api',
        webOrigin: 'http://localhost:58000',
        isWeb: true,
      ),
      'http://localhost:8080/api',
    );
  });

  test('native API base must be encrypted unless it is loopback', () {
    expect(() => requireEncryptedApiBase('https://roomies.example/api'),
        returnsNormally);
    expect(() => requireEncryptedApiBase('http://localhost:8080/api'),
        returnsNormally);
    expect(() => requireEncryptedApiBase('http://127.0.0.1:8080/api'),
        returnsNormally);
    expect(() => requireEncryptedApiBase('http://roomies.example/api'),
        throwsStateError);
    expect(() => requireEncryptedApiBase('http://192.168.1.20:8080/api'),
        throwsStateError);
    expect(
        () => requireEncryptedApiBase('http://10.0.2.2:8080/api',
            allowEmulatorHost: true),
        returnsNormally);
    expect(
        () => requireEncryptedApiBase('http://10.0.2.2:8080/api',
            allowEmulatorHost: false),
        throwsStateError);
  });
}
