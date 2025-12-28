# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2025_12_28_190720) do
  create_table "debriefs", force: :cascade do |t|
    t.datetime "completed_at"
    t.text "completion_summary"
    t.datetime "created_at", null: false
    t.text "error_message"
    t.datetime "notified_at"
    t.datetime "processed_at"
    t.string "recorded_by"
    t.string "status", default: "pending", null: false
    t.text "transcript"
    t.datetime "updated_at", null: false
    t.integer "user_id"
    t.index ["created_at"], name: "index_debriefs_on_created_at"
    t.index ["status"], name: "index_debriefs_on_status"
    t.index ["user_id"], name: "index_debriefs_on_user_id"
  end

  create_table "identities", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "email_address", null: false
    t.datetime "updated_at", null: false
    t.index ["email_address"], name: "index_identities_on_email_address", unique: true
  end

  create_table "magic_links", force: :cascade do |t|
    t.string "code", null: false
    t.datetime "created_at", null: false
    t.datetime "expires_at", null: false
    t.integer "identity_id", null: false
    t.string "purpose", default: "sign_in"
    t.datetime "updated_at", null: false
    t.index ["code"], name: "index_magic_links_on_code", unique: true
    t.index ["identity_id"], name: "index_magic_links_on_identity_id"
  end

  create_table "push_subscriptions", force: :cascade do |t|
    t.string "auth"
    t.datetime "created_at", null: false
    t.string "endpoint"
    t.string "p256dh"
    t.datetime "updated_at", null: false
    t.string "user_agent"
    t.integer "user_id"
    t.index ["user_id"], name: "index_push_subscriptions_on_user_id"
  end

  create_table "sessions", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "identity_id", null: false
    t.string "ip_address"
    t.datetime "last_active_at"
    t.string "token", null: false
    t.datetime "updated_at", null: false
    t.string "user_agent"
    t.index ["identity_id"], name: "index_sessions_on_identity_id"
    t.index ["token"], name: "index_sessions_on_token", unique: true
  end

  create_table "users", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "identity_id", null: false
    t.string "name", null: false
    t.datetime "updated_at", null: false
    t.index ["identity_id"], name: "index_users_on_identity_id"
  end

  add_foreign_key "debriefs", "users"
  add_foreign_key "magic_links", "identities"
  add_foreign_key "push_subscriptions", "users"
  add_foreign_key "sessions", "identities"
  add_foreign_key "users", "identities"
end
