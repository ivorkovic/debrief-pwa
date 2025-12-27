class AddNotifiedAtToDebriefs < ActiveRecord::Migration[8.1]
  def change
    add_column :debriefs, :notified_at, :datetime
  end
end
