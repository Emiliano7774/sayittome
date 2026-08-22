export function chatNotificationPromptOpen(input: {
  loading: boolean;
  hasUser: boolean;
  profileReady: boolean;
  notificationApiReady: boolean;
  prompted: boolean;
}) {
  if (input.loading || !input.hasUser || !input.profileReady) return false;
  if (!input.notificationApiReady) return false;
  return input.prompted !== true;
}
