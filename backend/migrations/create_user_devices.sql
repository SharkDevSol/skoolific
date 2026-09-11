-- Device token registry for mobile push notifications (FCM tokens)
CREATE TABLE IF NOT EXISTS user_devices (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,               -- guardian_username / student username / staff username
  user_type VARCHAR(20) NOT NULL,      -- 'guardian' | 'student' | 'staff'
  device_token TEXT NOT NULL UNIQUE,   -- FCM registration token
  device_type VARCHAR(20),             -- 'android' | 'ios' | 'web'
  device_name TEXT,
  app_version TEXT,
  os_version TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_devices_user ON user_devices (user_id, user_type);
