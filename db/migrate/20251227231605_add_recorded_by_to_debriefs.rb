class AddRecordedByToDebriefs < ActiveRecord::Migration[8.1]
  def change
    add_column :debriefs, :recorded_by, :string
  end
end
