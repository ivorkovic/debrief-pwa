class AddUserToDebriefsAndPushSubscriptions < ActiveRecord::Migration[8.1]
  def change
    add_reference :debriefs, :user, foreign_key: true
    add_reference :push_subscriptions, :user, foreign_key: true
  end
end
