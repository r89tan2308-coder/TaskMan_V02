import { describe, expect, it } from 'vitest';
import { getNotificationPermissionState } from './notificationService';

describe('notification permission state', () => {
  it('reports unsupported when Notification API is missing', () => {
    expect(getNotificationPermissionState(undefined)).toBe('unsupported');
  });

  it('reports granted permission', () => {
    expect(getNotificationPermissionState({ permission: 'granted' })).toBe('granted');
  });

  it('reports denied permission without converting it to a promptable state', () => {
    expect(getNotificationPermissionState({ permission: 'denied' })).toBe('denied');
  });

  it('reports default permission before explicit user action', () => {
    expect(getNotificationPermissionState({ permission: 'default' })).toBe('default');
  });
});
