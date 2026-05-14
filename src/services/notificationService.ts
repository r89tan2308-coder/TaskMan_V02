export type NotificationPermissionState =
  | 'default'
  | 'denied'
  | 'granted'
  | 'unsupported';

type NotificationLike = {
  new (title: string, options?: NotificationOptions): Notification;
  permission?: NotificationPermission;
  requestPermission?: () => Promise<NotificationPermission>;
};

type NotificationNavigator = Navigator & {
  serviceWorker?: ServiceWorkerContainer;
};

const getNotificationApi = (): NotificationLike | undefined =>
  typeof Notification === 'undefined' ? undefined : (Notification as NotificationLike);

export const getNotificationPermissionState = (
  notificationApi: Pick<NotificationLike, 'permission'> | undefined = getNotificationApi()
): NotificationPermissionState => {
  if (!notificationApi) return 'unsupported';
  return notificationApi.permission === 'granted' ||
    notificationApi.permission === 'denied' ||
    notificationApi.permission === 'default'
    ? notificationApi.permission
    : 'unsupported';
};

export const requestNotificationPermission = async (): Promise<NotificationPermissionState> => {
  const notificationApi = getNotificationApi();
  const current = getNotificationPermissionState(notificationApi);
  if (current === 'unsupported' || current === 'granted' || current === 'denied') {
    return current;
  }

  try {
    const next = await notificationApi?.requestPermission?.();
    return getNotificationPermissionState({ permission: next });
  } catch {
    return getNotificationPermissionState(notificationApi);
  }
};

export interface SafeNotificationInput {
  body?: string;
  tag?: string;
  title: string;
}

export const showSafeNotification = async ({
  body,
  tag,
  title
}: SafeNotificationInput): Promise<boolean> => {
  if (getNotificationPermissionState() !== 'granted') return false;

  const options: NotificationOptions = {
    body,
    tag,
    silent: false
  };

  try {
    const notificationNavigator =
      typeof navigator === 'undefined' ? null : (navigator as NotificationNavigator);
    const registration =
      notificationNavigator?.serviceWorker &&
      'ready' in notificationNavigator.serviceWorker
        ? await notificationNavigator.serviceWorker.ready
        : null;

    if (registration?.showNotification) {
      await registration.showNotification(title, options);
      return true;
    }

    const notificationApi = getNotificationApi();
    if (notificationApi) {
      new notificationApi(title, options);
      return true;
    }
  } catch {
    return false;
  }

  return false;
};
