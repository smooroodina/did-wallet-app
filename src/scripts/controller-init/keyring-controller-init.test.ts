import { ActionConstraint, Messenger } from '@metamask/base-controller';
import { NetworkControllerGetSelectedNetworkClientAction } from '@metamask/network-controller';
import { KeyringController } from '@metamask/keyring-controller';
import { ControllerInitRequest } from './types';
import { buildControllerInitRequestMock } from './test/utils';
import {
  getKeyringControllerMessenger,
  KeyringControllerMessenger,
  getKeyringControllerInitMessenger,
  KeyringControllerInitMessenger,
} from './messengers';
import { KeyringControllerInit } from './keyring-controller-init';

// Lightweight test runner (no Jest)
declare const process: {
  exit(code?: number): never;
};

let passedTests = 0;
let totalTests = 0;
const testPromises: Promise<void>[] = [];
const failures: { name: string; error: unknown }[] = [];

function test(name: string, testFn: () => void | Promise<void>) {
  totalTests++;
  console.log(`🧪 Testing: ${name}`);
  try {
    const maybePromise = testFn();
    if (maybePromise instanceof Promise) {
      const p = maybePromise
        .then(() => {
          console.log(`✅ PASSED: ${name}`);
          passedTests++;
        })
        .catch((error) => {
          console.log(`❌ FAILED: ${name}`);
          const err: any = error;
          const message = err?.message ?? String(err);
          console.error(`   Error: ${message}`);
          failures.push({ name, error });
        });
      testPromises.push(p);
    } else {
      console.log(`✅ PASSED: ${name}`);
      passedTests++;
    }
  } catch (error) {
    console.log(`❌ FAILED: ${name}`);
    const err: any = error;
    const message = err?.message ?? String(err);
    console.error(`   Error: ${message}`);
    failures.push({ name, error });
  }
}

function getInitRequestMock(): ControllerInitRequest<
  KeyringControllerMessenger,
  KeyringControllerInitMessenger
> {
  const baseMessenger = new Messenger<
    NetworkControllerGetSelectedNetworkClientAction | ActionConstraint,
    never
  >();

  baseMessenger.registerActionHandler(
    'NetworkController:getSelectedNetworkClient',
    () => ({
      provider: {},

      blockTracker: {},
    }),
  );

  const requestMock = {
    ...buildControllerInitRequestMock(),
    controllerMessenger: getKeyringControllerMessenger(baseMessenger),
    initMessenger: getKeyringControllerInitMessenger(baseMessenger),
  };

  return requestMock;
}

async function runTests() {
  console.log('🚀 Starting KeyringControllerInit Tests...\n');

  test('initializes the controller', () => {
    const { controller } = KeyringControllerInit(getInitRequestMock());
    if (!(controller instanceof KeyringController)) {
      throw new Error('controller is not an instance of KeyringController');
    }
  });

  test('initializes without throwing with expected options shape', () => {
    const result = KeyringControllerInit(getInitRequestMock());
    if (!result || typeof result !== 'object') {
      throw new Error('KeyringControllerInit returned invalid result');
    }
  });

  if (testPromises.length > 0) {
    await Promise.allSettled(testPromises);
  }

  console.log('\n📊 Test Results:');
  console.log(`✅ Passed: ${passedTests}/${totalTests}`);

  if (failures.length > 0) {
    console.log('\n❗ Failures:');
    for (const f of failures) {
      const err: any = f.error;
      const message = err?.message ?? String(err);
      const stack = typeof err?.stack === 'string' ? err.stack.split('\n')[1] ?? '' : '';
      console.log(`- ${f.name}`);
      console.log(`  Message: ${message}`);
      if (stack) console.log(`  ${stack.trim()}`);
    }
  }

  if (passedTests === totalTests) {
    console.log('🎉 All tests passed!');
  } else {
    console.log('❌ Some tests failed');
    process.exit(1);
  }
}

console.log('Running tests...');
runTests().catch(console.error);
