class CreatePushSubscriptions < ActiveRecord::Migration[8.1]
  def change
    create_table :push_subscriptions do |t|
      t.string :endpoint
      t.string :p256dh
      t.string :auth
      t.string :user_agent

      t.timestamps
    end
  end
end
