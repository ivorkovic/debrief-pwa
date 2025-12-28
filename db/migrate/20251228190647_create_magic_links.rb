class CreateMagicLinks < ActiveRecord::Migration[8.1]
  def change
    create_table :magic_links do |t|
      t.references :identity, null: false, foreign_key: true
      t.string :code, null: false
      t.string :purpose, default: "sign_in"
      t.datetime :expires_at, null: false

      t.timestamps
    end
    add_index :magic_links, :code, unique: true
  end
end
