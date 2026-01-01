class AddEntryTypeToDebriefs < ActiveRecord::Migration[8.1]
  def change
    add_column :debriefs, :entry_type, :string, default: "audio", null: false
  end
end
