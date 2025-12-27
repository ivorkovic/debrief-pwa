class CreateDebriefs < ActiveRecord::Migration[8.1]
  def change
    create_table :debriefs do |t|
      t.text :transcript
      t.string :status, default: "pending", null: false
      t.datetime :processed_at
      t.text :error_message

      t.timestamps
    end

    add_index :debriefs, :status
    add_index :debriefs, :created_at
  end
end
